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
import type { AnyContentType, PageOf } from '../content-type.ts';
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
  | { ok: true; id: string; version: number; revisionId: string; issues: PageIssue[] }
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

  return { ok: true, ...saved, issues: prepared.issues };
}

/** Takes a page off the live site. Service-role client only (see top of file). */
export async function unpublishPage(client: SupabaseClient, pageId: string, userId: string): Promise<void> {
  const { error } = await client.rpc('cera_unpublish_page', { p_page_id: pageId, p_user: userId });
  if (error) fail(error);
}
