/**
 * `@lateraltranslucence/cera/supabase` — loading and saving pages.
 *
 * Which client to pass:
 *   - getPublishedPage: any client (anon is enough).
 *   - getPageForEditing / getDraftPage / listPages / pageHistory / pageLinks:
 *     a client signed in as a staff user (row-level security limits working
 *     copies to admin/editor/viewer).
 *   - savePage / unpublishPage / deletePage / restoreRevision: a service-role client, on the server only.
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

import { CeraDatabaseError, fail } from './errors.ts';

export { mediaUrl } from '../media-url.ts';
export { formatBytes } from '../media.ts';
export { deleteMedia, finishMediaUpload, listMedia, MEDIA_BUCKET, mediaPathFor, mediaUsage, prepareMediaUpload, updateMedia } from './media.ts';
export {
  CERA_ROLE_LABELS,
  CERA_ROLES,
  ceraRoleOf,
  createCeraUser,
  isCeraRole,
  listCeraUsers,
  setCeraRole,
  temporaryPassword,
  type CeraRole,
  type CeraUser,
  type CreateUserResult,
  type UserResult,
} from './users.ts';

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

export { CeraDatabaseError };

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
  /** The version that's live. */
  liveVersion?: number;
  /** Published, and the working copy differs from what's live. */
  unpublishedChanges: boolean;
  /** When the working copy was last saved. */
  updatedAt: string;
  /** A pending scheduled publish. */
  schedule?: PageSchedule;
}

/** A scheduled publish: `version` goes live at `at` (ISO time). `failed` explains one that couldn't. */
export interface PageSchedule {
  at: string;
  version: number;
}

/**
 * The working copy for the admin. Deliberately *not* run through `readPage`:
 * the editor must receive everything, so a save can't drop what it never saw.
 */
export async function getPageForEditing(client: SupabaseClient, ct: AnyContentType, id: string): Promise<EditablePage | null> {
  const { data, error } = await client
    .from('cera_pages')
    .select(`id, version, updated_at, ${PAGE_COLUMNS}`)
    .eq('content_type', ct.name)
    .eq('id', id)
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const row = data as PageRow & { id: string; version: number; updated_at: string };

  const live = await client.from('cera_page_revisions').select(`page_version, ${PAGE_COLUMNS}`).eq('page_id', id).eq('is_published', true).maybeSingle();
  if (live.error) fail(live.error);
  const liveRow = live.data as (PageRow & { page_version: number }) | null;
  const content = (r: PageRow) => JSON.stringify([r.title, r.slug, r.boxes, r.panels]);
  const pending = await client
    .from('cera_page_revisions')
    .select('page_version, scheduled_for')
    .eq('page_id', id)
    .eq('schedule_status', 'pending')
    .maybeSingle();
  if (pending.error) fail(pending.error);
  const sched = pending.data as { page_version: number; scheduled_for: string } | null;

  return {
    page: toStored(row.id, row),
    version: row.version,
    published: liveRow !== null,
    liveVersion: liveRow?.page_version,
    unpublishedChanges: liveRow !== null && content(liveRow) !== content(row),
    updatedAt: row.updated_at,
    ...(sched && { schedule: { at: sched.scheduled_for, version: sched.page_version } }),
  };
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
  /** Email of whoever saved last, when the caller may see it. */
  updatedBy?: string;
  panelCount: number;
  published: boolean;
  /** Published, and the saved working copy differs from what's live. */
  unpublishedChanges: boolean;
  schedule?: PageSchedule;
  /** Why the last scheduled publish didn't happen, if nothing newer is live. */
  scheduleFailed?: string;
}

type SummaryRow = {
  id: string;
  content_type: string;
  slug: string;
  title: string;
  version: number;
  updated_at: string;
  updated_by_email: string | null;
  panel_count: number;
  live_version: number | null;
  live_differs: boolean | null;
  scheduled_for: string | null;
  scheduled_version: number | null;
  schedule_failed: string | null;
};

/** Working copies for the admin's page list, sorted by title. Staff client (row-level security). */
export async function listPages(client: SupabaseClient, opts: { contentType?: string } = {}): Promise<PageSummary[]> {
  const { data, error } = await client.rpc('cera_page_summaries', { p_content_type: opts.contentType ?? null });
  if (error) fail(error);
  return ((data as SummaryRow[] | null) ?? [])
    .map((r) => ({
      id: r.id,
      contentType: r.content_type,
      slug: r.slug,
      title: r.title,
      version: r.version,
      updatedAt: r.updated_at,
      ...(r.updated_by_email && { updatedBy: r.updated_by_email }),
      panelCount: r.panel_count,
      published: r.live_version !== null,
      unpublishedChanges: r.live_differs === true,
      ...(r.scheduled_for && r.scheduled_version !== null && { schedule: { at: r.scheduled_for, version: r.scheduled_version } }),
      ...(r.schedule_failed && { scheduleFailed: r.schedule_failed }),
    }))
    .sort((a, b) => (a.title || a.slug).localeCompare(b.title || b.slug));
}

/* ------------------------------------------------------------------ */
/* Saving                                                              */
/* ------------------------------------------------------------------ */

export interface SaveOptions {
  /** 'schedule' validates like 'publish', saves, and makes this version go live at `publishAt`. */
  mode: SaveMode | 'schedule';
  /** For 'schedule': when the page goes live (an ISO time in the future). */
  publishAt?: string;
  /** 0 to create a page; otherwise the `version` from `getPageForEditing`. */
  expectedVersion: number;
  /** The signed-in user, from a verified server-side session. */
  userId: string;
}

export type SaveResult =
  /** `page` is what was stored: defaults filled in, panels upgraded, rich text sanitized. */
  | { ok: true; id: string; version: number; revisionId: string; page: StoredPage; issues: PageIssue[] }
  | { ok: false; reason: 'invalid'; issues: PageIssue[] }
  | { ok: false; reason: 'conflict' | 'forbidden' | 'not-found' | 'slug-taken' | 'bad-time'; message: string; issues: PageIssue[] };

const REASONS: Record<string, 'conflict' | 'forbidden' | 'not-found' | 'slug-taken' | 'bad-time'> = {
  CE409: 'conflict',
  '42501': 'forbidden',
  CE404: 'not-found',
  '23505': 'slug-taken',
  CE400: 'bad-time',
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
  const schedule = opts.mode === 'schedule';
  const publishAt = schedule ? new Date(String(opts.publishAt ?? '')) : null;
  if (publishAt && (Number.isNaN(publishAt.getTime()) || publishAt.getTime() <= Date.now())) {
    return { ok: false, reason: 'bad-time', message: 'Pick a time in the future.', issues: [] };
  }
  // A scheduled version must be ready to go live, so it's checked like a publish.
  const prepared = await preparePageForSave(ct, raw, { mode: schedule ? 'publish' : (opts.mode as SaveMode) });
  if (!prepared.ok) return { ok: false, reason: 'invalid', issues: prepared.issues };

  const { data, error } = publishAt
    ? await client.rpc('cera_schedule_page', {
        p_page: prepared.page,
        p_expected_version: opts.expectedVersion,
        p_publish_at: publishAt.toISOString(),
        p_user: opts.userId,
      })
    : await client.rpc('cera_save_page', {
        p_page: prepared.page,
        p_expected_version: opts.expectedVersion,
        p_publish: opts.mode === 'publish',
        p_user: opts.userId,
      });
  return finishSave(ct, prepared, data, error, opts.mode === 'publish' ? 'published' : 'draft');
}

/** Maps a save rpc's outcome to a SaveResult and runs the content type's `afterSave`. */
async function finishSave(
  ct: AnyContentType,
  prepared: { page: StoredPage; issues: PageIssue[] },
  data: unknown,
  error: { code?: string; message: string } | null,
  status: 'published' | 'draft',
): Promise<SaveResult> {
  if (error) {
    const reason = error.code ? REASONS[error.code] : undefined;
    if (reason) return { ok: false, reason, message: error.message, issues: prepared.issues };
    fail(error);
  }
  const saved = data as { id: string; version: number; revisionId: string };

  const afterSave = ct.hooks?.afterSave;
  if (afterSave) {
    try {
      const { page } = readPage(ct, prepared.page, { status });
      await afterSave(page);
    } catch (e) {
      console.error(`cera: afterSave failed for page ${saved.id}`, e);
    }
  }

  return { ok: true, ...saved, page: prepared.page, issues: prepared.issues };
}

/** Takes a page off the live site, and cancels a pending scheduled publish. Service-role client only (see top of file). */
export async function unpublishPage(client: SupabaseClient, pageId: string, userId: string): Promise<void> {
  const { error } = await client.rpc('cera_unpublish_page', { p_page_id: pageId, p_user: userId });
  if (error) fail(error);
}

/** Cancels a page's pending scheduled publish. Service-role client only. */
export async function cancelSchedule(client: SupabaseClient, pageId: string, userId: string): Promise<void> {
  const { error } = await client.rpc('cera_cancel_schedule', { p_page_id: pageId, p_user: userId });
  if (error) fail(error);
}

/**
 * Publishes every scheduled version that's due; returns how many went live.
 * On Supabase a pg_cron job already runs this every minute (migration
 * 20261121000000); call it yourself only where pg_cron isn't available.
 * Service-role client only.
 */
export async function publishDuePages(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.rpc('cera_publish_due');
  if (error) fail(error);
  return Number(data ?? 0);
}

/* ------------------------------------------------------------------ */
/* Deleting                                                            */
/* ------------------------------------------------------------------ */

export type DeletePageResult =
  | { ok: true; id: string; contentType: string; slug: string }
  /** `live`: unpublish it first. `conflict`: someone saved it after the caller loaded it. */
  | { ok: false; reason: 'live' | 'conflict' | 'forbidden' | 'not-found'; message: string };

const DELETE_REASONS: Record<string, 'live' | 'conflict' | 'forbidden' | 'not-found'> = {
  CE422: 'live',
  CE409: 'conflict',
  '42501': 'forbidden',
  CE404: 'not-found',
};

/**
 * Deletes a page and all its history, for good. Only a page that isn't live,
 * and only at `expectedVersion` (so nobody deletes changes they haven't seen).
 * Pages linking to it stop showing it; check `pageLinks` first to warn.
 * Service-role client only (see top of file).
 */
export async function deletePage(client: SupabaseClient, pageId: string, opts: { expectedVersion: number; userId: string }): Promise<DeletePageResult> {
  const { data, error } = await client.rpc('cera_delete_page', { p_page_id: pageId, p_expected_version: opts.expectedVersion, p_user: opts.userId });
  if (error) {
    const reason = error.code ? DELETE_REASONS[error.code] : undefined;
    if (reason) return { ok: false, reason, message: error.message };
    fail(error);
  }
  return { ok: true, ...(data as { id: string; contentType: string; slug: string }) };
}

/** Another page that links to a page: `draft` when its working copy does, `live` when its published version does. */
export interface PageLink {
  id: string;
  title: string;
  slug: string;
  contentType: string;
  draft: boolean;
  live: boolean;
}

/** The other pages that link to a page (e.g. from a Featured Post panel). Staff client (row-level security). */
export async function pageLinks(client: SupabaseClient, pageId: string): Promise<PageLink[]> {
  const { data, error } = await client.rpc('cera_page_links', { p_page_id: pageId });
  if (error) fail(error);
  return (data as PageLink[] | null) ?? [];
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

/** One saved version of a page. */
export interface PageRevision {
  version: number;
  /** How it was saved. A 'schedule' revision's `schedule` says whether it went live. */
  kind: 'draft' | 'publish' | 'schedule';
  title: string;
  slug: string;
  /** This is the version on the live site now. */
  live: boolean;
  createdAt: string;
  /** Email of whoever saved it, when the caller may see it. */
  createdBy?: string;
  schedule?: { at: string; status: 'pending' | 'published' | 'cancelled' | 'failed' };
  /** Saved by restoring this older version. */
  restoredFrom?: number;
}

type HistoryRow = {
  page_version: number;
  kind: PageRevision['kind'];
  title: string;
  slug: string;
  is_published: boolean;
  created_at: string;
  created_by_email: string | null;
  scheduled_for: string | null;
  schedule_status: 'pending' | 'published' | 'cancelled' | 'failed' | null;
  restored_from: number | null;
};

/**
 * A page's saved versions, newest first: `limit` of them (default 30, at most
 * 100), older than version `before` when given. Staff client (row-level security).
 */
export async function pageHistory(client: SupabaseClient, pageId: string, opts: { before?: number; limit?: number } = {}): Promise<PageRevision[]> {
  const { data, error } = await client.rpc('cera_page_history', { p_page_id: pageId, p_before: opts.before ?? null, p_limit: opts.limit ?? 30 });
  if (error) fail(error);
  return ((data as HistoryRow[] | null) ?? []).map((r) => ({
    version: r.page_version,
    kind: r.kind,
    title: r.title,
    slug: r.slug,
    live: r.is_published,
    createdAt: r.created_at,
    ...(r.created_by_email && { createdBy: r.created_by_email }),
    ...(r.scheduled_for && r.schedule_status && { schedule: { at: r.scheduled_for, status: r.schedule_status } }),
    ...(r.restored_from !== null && { restoredFrom: r.restored_from }),
  }));
}

/**
 * Restores an old version: its content becomes the working copy, saved as a
 * new draft (checked and upgraded like any draft save). The live page is
 * unchanged until someone publishes. Returns what a draft `savePage` would;
 * `not-found` when the page has no such version. Service-role client only.
 */
export async function restoreRevision<CT extends AnyContentType>(
  client: SupabaseClient,
  ct: CT,
  pageId: string,
  version: number,
  opts: { expectedVersion: number; userId: string },
): Promise<SaveResult> {
  const { data: row, error: readError } = await client
    .from('cera_page_revisions')
    .select(PAGE_COLUMNS)
    .eq('page_id', pageId)
    .eq('page_version', version)
    .maybeSingle();
  if (readError) fail(readError);
  if (!row || (row as PageRow).content_type !== ct.name) {
    return { ok: false, reason: 'not-found', message: `This page has no version ${version}.`, issues: [] };
  }

  const prepared = await preparePageForSave(ct, toStored(pageId, row as PageRow), { mode: 'draft' });
  if (!prepared.ok) return { ok: false, reason: 'invalid', issues: prepared.issues };

  const { data, error } = await client.rpc('cera_restore_revision', {
    p_page: prepared.page,
    p_from: version,
    p_expected_version: opts.expectedVersion,
    p_user: opts.userId,
  });
  return finishSave(ct, prepared, data, error, 'draft');
}
