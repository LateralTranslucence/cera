/**
 * Test database: PGlite (Postgres in-process, no Docker) with the bits of
 * Supabase the migrations rely on, plus a fake Supabase client that runs the
 * same queries the real one would send, as a given role.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';

const MIGRATIONS = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');

/** Minimal stand-ins for what Supabase provisions before user migrations run. */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb not null default '{}'::jsonb);
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  grant usage on schema auth to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  -- Storage's objects table, as far as the media cleanup reads it.
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null,
    created_at timestamptz not null default now()
  );
  grant usage on schema storage to service_role;
  grant select on storage.buckets to service_role;
  grant select on storage.objects to service_role;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of readdirSync(MIGRATIONS).filter((fileName) => fileName.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  }
  return db;
}

export async function addUser(db: PGlite, role: 'admin' | 'editor' | 'author' | 'viewer' | null): Promise<string> {
  const id = crypto.randomUUID();
  await db.query('insert into auth.users (id, raw_app_meta_data) values ($1, $2)', [id, role ? { cera_role: role } : {}]);
  return id;
}

export type DbRole = 'anon' | 'authenticated' | 'service_role';

/** Runs `sql` as `role`, with JWT claims visible to auth.jwt(). */
export async function queryAs<Row = Record<string, unknown>>(
  db: PGlite,
  role: DbRole,
  sql: string,
  params: unknown[] = [],
  claims: Record<string, unknown> = {},
): Promise<Row[]> {
  return db.transaction(async (transaction) => {
    await transaction.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await transaction.exec(`set local role ${role}`);
    const result = await transaction.query<Row>(sql, params);
    return result.rows;
  });
}

type PgError = { code?: string; message: string };

function toError(error: unknown): PgError {
  const databaseError = error as { code?: string; message?: string };
  return { code: databaseError.code, message: databaseError.message ?? String(error) };
}

/**
 * The subset of supabase-js the Cera Supabase module uses:
 *   from(t).select(cols).eq(c, v)….maybeSingle()
 *   from(t).select(cols).in(c, vs).ilike(c, p).lt(c, v).order(c, { ascending }).limit(n)
 *   rpc(fn, namedArgs)
 *   storage.from(bucket).createSignedUploadUrl / info / remove
 *
 * `objects` stands in for the cera-media bucket: tests add what a browser
 * would have uploaded, and see what the code deleted.
 */
export function fakeSupabase(
  db: PGlite,
  role: DbRole,
  claims: Record<string, unknown> = {},
  objects: Map<string, FakeObject> = new Map(),
): SupabaseClient {
  const from = (table: string) => {
    let columns = '*';
    let orderBy = '';
    let limit = '';
    // [column, value, operator]: `=` for eq, `= any` for in (value is an array), `ilike` for ilike, `<` for lt.
    const filters: Array<[string, unknown, 'eq' | 'in' | 'ilike' | 'lt']> = [];
    const operators = { eq: '=', ilike: 'ilike', lt: '<' } as const;
    const condition = ([column, , operator]: (typeof filters)[number], i: number) =>
      operator === 'in' ? `${column}::text = any($${i + 1}::text[])` : `${column} ${operators[operator]} $${i + 1}`;
    const run = async (single: boolean) => {
      const where = filters.length ? ` where ${filters.map(condition).join(' and ')}` : '';
      try {
        const rows = await queryAs(db, role, `select ${columns} from public.${table}${where}${orderBy}${limit}`, filters.map(([, value]) => value), claims);
        if (single && rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
        return { data: single ? (rows[0] ?? null) : rows, error: null };
      } catch (error) {
        return { data: null, error: toError(error) };
      }
    };
    const builder = {
      select(columnList: string) {
        columns = columnList;
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value, 'eq']);
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push([column, values, 'in']);
        return builder;
      },
      ilike(column: string, pattern: string) {
        filters.push([column, pattern, 'ilike']);
        return builder;
      },
      lt(column: string, value: unknown) {
        filters.push([column, value, 'lt']);
        return builder;
      },
      order(column: string, options: { ascending?: boolean } = {}) {
        orderBy = ` order by ${column} ${options.ascending === false ? 'desc' : 'asc'}`;
        return builder;
      },
      limit(maxRows: number) {
        limit = ` limit ${Number(maxRows)}`;
        return builder;
      },
      maybeSingle: () => run(true),
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => run(false).then(resolve, reject),
    };
    return builder;
  };

  const rpc = async (functionName: string, parameters: Record<string, unknown> = {}) => {
    const keys = Object.keys(parameters);
    const call = `public.${functionName}(${keys.map((key, i) => `${key} => $${i + 1}`).join(', ')})`;
    // Functions that return rows come back as a JSON array, as PostgREST sends them (times as ISO strings).
    const procedures = await db.query<{ proretset: boolean; names: string[] | null; types: string[] }>(
      `select p.proretset, p.proargnames as names, p.proargtypes::regtype[]::text[] as types
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1 limit 1`,
      [functionName],
    );
    const procedure = procedures.rows[0];
    const sql = procedure?.proretset ? `select coalesce(jsonb_agg(t), '[]'::jsonb) as result from ${call} t` : `select ${call} as result`;
    // As PostgREST does: JSON for json/jsonb arguments, Postgres arrays for array arguments.
    const typeOf = (key: string) => procedure?.types[procedure.names?.indexOf(key) ?? -1] ?? '';
    const params = keys.map((key) => {
      const value = parameters[key];
      if (Array.isArray(value) && typeOf(key).endsWith('[]')) return value;
      return value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
    });
    try {
      const rows = await queryAs<{ result: unknown }>(db, role, sql, params, claims);
      return { data: rows[0]?.result ?? null, error: null };
    } catch (error) {
      return { data: null, error: toError(error) };
    }
  };

  const storage = {
    from: (bucket: string) => ({
      async createSignedUploadUrl(path: string) {
        if (role !== 'service_role') return { data: null, error: { message: 'new row violates row-level security policy', statusCode: '403' } };
        const token = `token-${path}`;
        return { data: { path, token, signedUrl: `https://storage.test/object/upload/sign/${bucket}/${path}?token=${token}` }, error: null };
      },
      async info(path: string) {
        const storedObject = objects.get(path);
        if (!storedObject) return { data: null, error: { message: 'Object not found', statusCode: '404' } };
        return { data: { name: path, bucketId: bucket, contentType: storedObject.contentType, size: storedObject.size }, error: null };
      },
      async remove(paths: string[]) {
        for (const path of paths) objects.delete(path);
        return { data: paths.map((name) => ({ name })), error: null };
      },
    }),
  };

  return { from, rpc, storage } as unknown as SupabaseClient;
}

/** An object in the fake cera-media bucket. */
export interface FakeObject {
  contentType: string;
  size: number;
}
