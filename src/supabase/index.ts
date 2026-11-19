/**
 * `@lateraltranslucence/cera/supabase` — loading and saving pages.
 *
 * Which client to pass:
 *   - getPublishedPage: any client (anon is enough).
 *   - getPageForEditing / getDraftPage: a client signed in as a staff user
 *     (row-level security limits working copies to admin/editor/viewer).
 *   - savePage / unpublishPage: a service-role client, on the server only.
 *     `userId` must come from a verified session (e.g. supabase.auth.getUser()
 *     on the server), never from the request body. The database checks that
 *     this user is an admin or editor.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { pageUrl, type AnyContentType, type PageOf } from '../content-type.ts';
import type { LinkedPage, PageResolver } from '../panel.ts';
import {
  preparePageForSave,
  readPage,
  type PageIssue,
  type ReadOptions,
  type ReadResult,
  type SaveMode,
  type StoredPage,
} from '../document.ts';
import type { StoredPanel } from '../migrate.ts';

const PAGE_COLUMNS = 'content_type, slug, title, boxes, panels';

interface PageRow {
  content_type: string;
  slug: string;
  title: string;
  boxes: Record<string, Record<string, unknown>>;
  panels: StoredPanel[];
}

function toStored(id: string, row: PageRow): StoredPage {
  return { id, contentType: row.content_type, slug: row.slug, title: row.title, boxes: row.boxes, panels: row.panels };
}

export class CeraDatabaseError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'CeraDatabaseError';
  }
}

function fail(error: { message: string; code?: string }): never {
  throw new CeraDatabaseError(error.message, error.code);
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/** The live version of a page, for the public site. `null` if there is none. */
export async function getPublishedPage<CT extends AnyContentType>(
  client: SupabaseClient,
  ct: CT,
  slug: string,
  opts: Omit<ReadOptions, 'status'> = {},
): Promise<ReadResult<PageOf<CT>> | null> {
  const { data, error } = await client
    .from('cera_page_revisions')
    .select(`page_id, ${PAGE_COLUMNS}`)
    .eq('content_type', ct.name)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const row = data as PageRow & { page_id: string };
  return readPage(ct, toStored(row.page_id, row), { ...opts, status: 'published' });
}

/** The working copy by slug, typed for rendering. For draft-mode preview. */
export async function getDraftPage<CT extends AnyContentType>(
  client: SupabaseClient,
  ct: CT,
  slug: string,
  opts: Omit<ReadOptions, 'status'> = {},
): Promise<ReadResult<PageOf<CT>> | null> {
  const { data, error } = await client
    .from('cera_pages')
    .select(`id, ${PAGE_COLUMNS}`)
    .eq('content_type', ct.name)
    .eq('slug', slug)
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const row = data as PageRow & { id: string };
  return readPage(ct, toStored(row.id, row), { ...opts, status: 'draft' });
}

export interface EditablePage {
  /** Exactly as stored, unknown panels and keys included. Send it back to `savePage`. */
  page: StoredPage;
  /** Pass to `savePage` as `expectedVersion`. */
  version: number;
  published: boolean;
}

/**
 * The working copy for the admin. Deliberately *not* run through `readPage`:
 * the editor must receive everything, so a save can't drop what it never saw.
 */
export async function getPageForEditing(client: SupabaseClient, ct: AnyContentType, id: string): Promise<EditablePage | null> {
  const { data, error } = await client
    .from('cera_pages')
    .select(`id, version, ${PAGE_COLUMNS}`)
    .eq('content_type', ct.name)
    .eq('id', id)
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const row = data as PageRow & { id: string; version: number };

  const live = await client.from('cera_page_revisions').select('id').eq('page_id', id).eq('is_published', true).maybeSingle();
  if (live.error) fail(live.error);

  return { page: toStored(row.id, row), version: row.version, published: live.data !== null };
}

/**
 * Looks up linked pages for panels' `load` (e.g. Featured Post).
 *
 * - Live (`draft: false`): published revisions only, never hidden pages, so a
 *   panel can't leak a draft or an unpublished page. Any client works.
 * - Draft preview (`draft: true`): working copies, hidden pages included.
 *   Needs a client that can read them (a staff user, or the secret key on the
 *   server behind draft mode).
 *
 * Pages whose content type isn't in `contentTypes` are skipped.
 */
export function createPageResolver(client: SupabaseClient, contentTypes: readonly AnyContentType[], opts: { draft: boolean }): PageResolver {
  const byName = new Map(contentTypes.map((ct) => [ct.name as string, ct]));
  return {
    async byIds(ids) {
      const wanted = [...new Set(ids)].filter((id) => UUID.test(id));
      if (wanted.length === 0) return [];
      const { data, error } = opts.draft
        ? await client.from('cera_pages').select(`id, ${PAGE_COLUMNS}`).in('id', wanted)
        : await client.from('cera_page_revisions').select(`page_id, ${PAGE_COLUMNS}`).in('page_id', wanted).eq('is_published', true);
      if (error) fail(error);

      const found = new Map<string, LinkedPage>();
      for (const row of data as Array<PageRow & { id?: string; page_id?: string }>) {
        const id = (row.page_id ?? row.id) as string;
        const ct = byName.get(row.content_type);
        if (!ct) continue;
        const { page } = readPage(ct, toStored(id, row), { status: opts.draft ? 'draft' : 'published' });
        if (!opts.draft && ct.hidden?.(page)) continue;
        found.set(id, {
          id,
          contentType: ct.name,
          contentTypeLabel: ct.label,
          slug: page.slug,
          title: page.title,
          url: pageUrl(ct, page),
          description: ct.seo?.description?.(page) || undefined,
          image: ct.seo?.image?.(page),
        });
      }
      return ids.map((id) => found.get(id)).filter((p): p is LinkedPage => p !== undefined);
    },
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PageSummary {
  id: string;
  contentType: string;
  slug: string;
  title: string;
  version: number;
  updatedAt: string;
  published: boolean;
}

/** Working copies for the admin's page list, sorted by title. Staff client (row-level security). */
export async function listPages(client: SupabaseClient, opts: { contentType?: string } = {}): Promise<PageSummary[]> {
  let query = client.from('cera_pages').select('id, content_type, slug, title, version, updated_at');
  if (opts.contentType) query = query.eq('content_type', opts.contentType);
  const { data, error } = await query;
  if (error) fail(error);

  const live = await client.from('cera_page_revisions').select('page_id').eq('is_published', true);
  if (live.error) fail(live.error);
  const published = new Set((live.data as Array<{ page_id: string }>).map((r) => r.page_id));

  return (data as Array<{ id: string; content_type: string; slug: string; title: string; version: number; updated_at: string }>)
    .map((r) => ({
      id: r.id,
      contentType: r.content_type,
      slug: r.slug,
      title: r.title,
      version: r.version,
      updatedAt: r.updated_at,
      published: published.has(r.id),
    }))
    .sort((a, b) => (a.title || a.slug).localeCompare(b.title || b.slug));
}

/* ------------------------------------------------------------------ */
/* Saving                                                              */
/* ------------------------------------------------------------------ */

export interface SaveOptions {
  mode: SaveMode;
  /** 0 to create a page; otherwise the `version` from `getPageForEditing`. */
  expectedVersion: number;
  /** The signed-in user, from a verified server-side session. */
  userId: string;
}

export type SaveResult =
  /** `page` is what was stored: defaults filled in, panels upgraded, rich text sanitized. */
  | { ok: true; id: string; version: number; revisionId: string; page: StoredPage; issues: PageIssue[] }
  | { ok: false; reason: 'invalid'; issues: PageIssue[] }
  | { ok: false; reason: 'conflict' | 'forbidden' | 'not-found' | 'slug-taken'; message: string; issues: PageIssue[] };

const REASONS: Record<string, 'conflict' | 'forbidden' | 'not-found' | 'slug-taken'> = {
  CE409: 'conflict',
  '42501': 'forbidden',
  CE404: 'not-found',
  '23505': 'slug-taken',
};

/**
 * Validates and saves a page (`mode: 'publish'` also makes it live).
 * Expected failures come back as `{ ok: false, reason }`; anything else throws.
 * `afterSave` errors are logged, not thrown: the page is already saved.
 */
export async function savePage<CT extends AnyContentType>(
  client: SupabaseClient,
  ct: CT,
  raw: unknown,
  opts: SaveOptions,
): Promise<SaveResult> {
  const prepared = await preparePageForSave(ct, raw, { mode: opts.mode });
  if (!prepared.ok) return { ok: false, reason: 'invalid', issues: prepared.issues };

  const { data, error } = await client.rpc('cera_save_page', {
    p_page: prepared.page,
    p_expected_version: opts.expectedVersion,
    p_publish: opts.mode === 'publish',
    p_user: opts.userId,
  });
  if (error) {
    const reason = error.code ? REASONS[error.code] : undefined;
    if (reason) return { ok: false, reason, message: error.message, issues: prepared.issues };
    fail(error);
  }
  const saved = data as { id: string; version: number; revisionId: string };

  const afterSave = ct.hooks?.afterSave;
  if (afterSave) {
    try {
      const { page } = readPage(ct, prepared.page, { status: opts.mode === 'publish' ? 'published' : 'draft' });
      await afterSave(page);
    } catch (e) {
      console.error(`cera: afterSave failed for page ${saved.id}`, e);
    }
  }

  return { ok: true, ...saved, page: prepared.page, issues: prepared.issues };
}

/** Takes a page off the live site. Service-role client only (see top of file). */
export async function unpublishPage(client: SupabaseClient, pageId: string, userId: string): Promise<void> {
  const { error } = await client.rpc('cera_unpublish_page', { p_page_id: pageId, p_user: userId });
  if (error) fail(error);
}
