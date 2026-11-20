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
  create table auth.users (id uuid primary key, raw_app_meta_data jsonb not null default '{}'::jsonb);
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  grant usage on schema auth to anon, authenticated, service_role;

  create schema storage;
  create table storage.buckets (
    id text primary key, name text not null, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  grant usage on schema storage to service_role;
  grant select on storage.buckets to service_role;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  }
  return db;
}

export async function addUser(db: PGlite, role: 'admin' | 'editor' | 'viewer' | null): Promise<string> {
  const id = crypto.randomUUID();
  await db.query('insert into auth.users (id, raw_app_meta_data) values ($1, $2)', [id, role ? { cera_role: role } : {}]);
  return id;
}

export type DbRole = 'anon' | 'authenticated' | 'service_role';

/** Runs `sql` as `role`, with JWT claims visible to auth.jwt(). */
export async function queryAs<T = Record<string, unknown>>(
  db: PGlite,
  role: DbRole,
  sql: string,
  params: unknown[] = [],
  claims: Record<string, unknown> = {},
): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await tx.exec(`set local role ${role}`);
    const r = await tx.query<T>(sql, params);
    return r.rows;
  });
}

type PgError = { code?: string; message: string };

function toError(e: unknown): PgError {
  const err = e as { code?: string; message?: string };
  return { code: err.code, message: err.message ?? String(e) };
}

/**
 * The subset of supabase-js the Cera Supabase module uses:
 *   from(t).select(cols).eq(c, v)….maybeSingle()
 *   from(t).select(cols).in(c, vs).ilike(c, p).order(c, { ascending }).limit(n)
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
    // [column, value, operator]: `=` for eq, `= any` for in (value is an array), `ilike` for ilike.
    const filters: Array<[string, unknown, 'eq' | 'in' | 'ilike']> = [];
    const condition = ([c, , op]: (typeof filters)[number], i: number) =>
      op === 'in' ? `${c}::text = any($${i + 1}::text[])` : op === 'ilike' ? `${c} ilike $${i + 1}` : `${c} = $${i + 1}`;
    const run = async (single: boolean) => {
      const where = filters.length ? ` where ${filters.map(condition).join(' and ')}` : '';
      try {
        const rows = await queryAs(db, role, `select ${columns} from public.${table}${where}${orderBy}${limit}`, filters.map(([, v]) => v), claims);
        if (single && rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } };
        return { data: single ? (rows[0] ?? null) : rows, error: null };
      } catch (e) {
        return { data: null, error: toError(e) };
      }
    };
    const builder = {
      select(cols: string) {
        columns = cols;
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
      order(column: string, opts: { ascending?: boolean } = {}) {
        orderBy = ` order by ${column} ${opts.ascending === false ? 'desc' : 'asc'}`;
        return builder;
      },
      limit(n: number) {
        limit = ` limit ${Number(n)}`;
        return builder;
      },
      maybeSingle: () => run(true),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => run(false).then(resolve, reject),
    };
    return builder;
  };

  const rpc = async (fn: string, args: Record<string, unknown> = {}) => {
    const keys = Object.keys(args);
    const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as result`;
    const params = keys.map((k) => {
      const v = args[k];
      return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
    });
    try {
      const rows = await queryAs<{ result: unknown }>(db, role, sql, params, claims);
      return { data: rows[0]?.result ?? null, error: null };
    } catch (e) {
      return { data: null, error: toError(e) };
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
        const o = objects.get(path);
        if (!o) return { data: null, error: { message: 'Object not found', statusCode: '404' } };
        return { data: { name: path, bucketId: bucket, contentType: o.contentType, size: o.size }, error: null };
      },
      async remove(paths: string[]) {
        for (const p of paths) objects.delete(p);
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
