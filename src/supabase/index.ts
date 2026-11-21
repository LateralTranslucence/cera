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
export {
  addSubmission,
  createFormResolver,
  DEFAULT_FORM_ENDPOINT,
  deleteSubmissions,
  getDraftForm,
  getLiveForm,
  listSubmissions,
  submissionCounts,
  type AddSubmissionResult,
  type Submission,
} from './forms.ts';
export { supabaseIcons } from './icons.ts';
export { createSearchResolver, DEFAULT_SEARCH_ENDPOINT, searchableText, searchedTypes } from './search.ts';
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

/** The page as the save functions take it: with its content type's address scope (see `slugScope`). */
function forRpc(contentType: AnyContentType, page: StoredPage) {
  return { ...page, slugScope: contentType.slugScope ?? contentType.name };
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/** The live version of a page, for the public site. `null` if there is none. */
export async function getPublishedPage<Type extends AnyContentType>(
  client: SupabaseClient,
  contentType: Type,
  slug: string,
  options: Omit<ReadOptions, 'status'> = {},
): Promise<ReadResult<PageOf<Type>> | null> {
  const { data, error } = await client
    .from('cera_page_revisions')
    .select(`page_id, ${PAGE_COLUMNS}`)
    .eq('content_type', contentType.name)
    .eq('slug', slug)
    .eq('is_published', true)
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const row = data as PageRow & { page_id: string };
  return readPage(contentType, toStored(row.page_id, row), { ...options, status: 'published' });
}

/** The working copy by slug, typed for rendering. For draft-mode preview. */
export async function getDraftPage<Type extends AnyContentType>(
  client: SupabaseClient,
  contentType: Type,
  slug: string,
  options: Omit<ReadOptions, 'status'> = {},
): Promise<ReadResult<PageOf<Type>> | null> {
  const { data, error } = await client
    .from('cera_pages')
    .select(`id, ${PAGE_COLUMNS}`)
    .eq('content_type', contentType.name)
    .eq('slug', slug)
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const row = data as PageRow & { id: string };
  return readPage(contentType, toStored(row.id, row), { ...options, status: 'draft' });
}

/** A page found among several content types; `type` names which one it is. */
export type FoundPage<Type extends AnyContentType> = Type extends AnyContentType ? ReadResult<PageOf<Type>> & { type: Type['name'] } : never;

/**
 * The live page at `slug` among several content types, for a route they
 * share (give them one `slugScope`, so at most one can hold the slug).
 * Plain data, so it can be cached; `type` says which content type it is.
 */
export async function findPublishedPage<const Types extends readonly AnyContentType[]>(
  client: SupabaseClient,
  contentTypes: Types,
  slug: string,
  options: Omit<ReadOptions, 'status'> = {},
): Promise<FoundPage<Types[number]> | null> {
  const { data, error } = await client
    .from('cera_page_revisions')
    .select(`page_id, ${PAGE_COLUMNS}`)
    .in('content_type', contentTypes.map((type) => type.name))
    .eq('slug', slug)
    .eq('is_published', true)
    .limit(1)
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const row = data as PageRow & { page_id: string };
  const contentType = contentTypes.find((candidate) => candidate.name === row.content_type)!;
  return { ...readPage(contentType, toStored(row.page_id, row), { ...options, status: 'published' }), type: contentType.name } as FoundPage<Types[number]>;
}

/** Like `findPublishedPage`, for the working copies (draft-mode preview). */
export async function findDraftPage<const Types extends readonly AnyContentType[]>(
  client: SupabaseClient,
  contentTypes: Types,
  slug: string,
  options: Omit<ReadOptions, 'status'> = {},
): Promise<FoundPage<Types[number]> | null> {
  const { data, error } = await client
    .from('cera_pages')
    .select(`id, ${PAGE_COLUMNS}`)
    .in('content_type', contentTypes.map((type) => type.name))
    .eq('slug', slug)
    .limit(1)
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const row = data as PageRow & { id: string };
  const contentType = contentTypes.find((candidate) => candidate.name === row.content_type)!;
  return { ...readPage(contentType, toStored(row.id, row), { ...options, status: 'draft' }), type: contentType.name } as FoundPage<Types[number]>;
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
export async function getPageForEditing(client: SupabaseClient, contentType: AnyContentType, id: string): Promise<EditablePage | null> {
  const { data, error } = await client
    .from('cera_pages')
    .select(`id, version, updated_at, ${PAGE_COLUMNS}`)
    .eq('content_type', contentType.name)
    .eq('id', id)
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const row = data as PageRow & { id: string; version: number; updated_at: string };

  const live = await client.from('cera_page_revisions').select(`page_version, ${PAGE_COLUMNS}`).eq('page_id', id).eq('is_published', true).maybeSingle();
  if (live.error) fail(live.error);
  const liveRow = live.data as (PageRow & { page_version: number }) | null;
  const content = (pageRow: PageRow) => JSON.stringify([pageRow.title, pageRow.slug, pageRow.boxes, pageRow.panels]);
  const pending = await client
    .from('cera_page_revisions')
    .select('page_version, scheduled_for')
    .eq('page_id', id)
    .eq('schedule_status', 'pending')
    .maybeSingle();
  if (pending.error) fail(pending.error);
  const schedule = pending.data as { page_version: number; scheduled_for: string } | null;

  return {
    page: toStored(row.id, row),
    version: row.version,
    published: liveRow !== null,
    liveVersion: liveRow?.page_version,
    unpublishedChanges: liveRow !== null && content(liveRow) !== content(row),
    updatedAt: row.updated_at,
    ...(schedule && { schedule: { at: schedule.scheduled_for, version: schedule.page_version } }),
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
export function createPageResolver(client: SupabaseClient, contentTypes: readonly AnyContentType[], options: { draft: boolean }): PageResolver {
  const byName = new Map(contentTypes.map((contentType) => [contentType.name as string, contentType]));
  return {
    async byIds(ids) {
      const wanted = [...new Set(ids)].filter((id) => UUID.test(id));
      if (wanted.length === 0) return [];
      const { data, error } = options.draft
        ? await client.from('cera_pages').select(`id, ${PAGE_COLUMNS}`).in('id', wanted)
        : await client.from('cera_page_revisions').select(`page_id, ${PAGE_COLUMNS}`).in('page_id', wanted).eq('is_published', true);
      if (error) fail(error);

      const found = new Map<string, LinkedPage>();
      for (const row of data as Array<PageRow & { id?: string; page_id?: string }>) {
        const id = (row.page_id ?? row.id) as string;
        const contentType = byName.get(row.content_type);
        if (!contentType) continue;
        const { page } = readPage(contentType, toStored(id, row), { status: options.draft ? 'draft' : 'published' });
        if (!options.draft && contentType.hidden?.(page)) continue;
        found.set(id, {
          id,
          contentType: contentType.name,
          contentTypeLabel: contentType.label,
          slug: page.slug,
          title: page.title,
          url: pageUrl(contentType, page),
          description: contentType.seo?.description?.(page) || undefined,
          image: contentType.seo?.image?.(page),
        });
      }
      return ids.map((id) => found.get(id)).filter((linkedPage): linkedPage is LinkedPage => linkedPage !== undefined);
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
export async function listPages(client: SupabaseClient, options: { contentType?: string } = {}): Promise<PageSummary[]> {
  const { data, error } = await client.rpc('cera_page_summaries', { p_content_type: options.contentType ?? null });
  if (error) fail(error);
  return ((data as SummaryRow[] | null) ?? [])
    .map((row) => ({
      id: row.id,
      contentType: row.content_type,
      slug: row.slug,
      title: row.title,
      version: row.version,
      updatedAt: row.updated_at,
      ...(row.updated_by_email && { updatedBy: row.updated_by_email }),
      panelCount: row.panel_count,
      published: row.live_version !== null,
      unpublishedChanges: row.live_differs === true,
      ...(row.scheduled_for && row.scheduled_version !== null && { schedule: { at: row.scheduled_for, version: row.scheduled_version } }),
      ...(row.schedule_failed && { scheduleFailed: row.schedule_failed }),
    }))
    .sort((first, second) => (first.title || first.slug).localeCompare(second.title || second.slug));
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
export async function savePage<Type extends AnyContentType>(
  client: SupabaseClient,
  contentType: Type,
  raw: unknown,
  options: SaveOptions,
): Promise<SaveResult> {
  const schedule = options.mode === 'schedule';
  const publishAt = schedule ? new Date(String(options.publishAt ?? '')) : null;
  if (publishAt && (Number.isNaN(publishAt.getTime()) || publishAt.getTime() <= Date.now())) {
    return { ok: false, reason: 'bad-time', message: 'Pick a time in the future.', issues: [] };
  }
  // A scheduled version must be ready to go live, so it's checked like a publish.
  const prepared = await preparePageForSave(contentType, raw, { mode: schedule ? 'publish' : (options.mode as SaveMode) });
  if (!prepared.ok) return { ok: false, reason: 'invalid', issues: prepared.issues };

  const { data, error } = publishAt
    ? await client.rpc('cera_schedule_page', {
        p_page: forRpc(contentType, prepared.page),
        p_expected_version: options.expectedVersion,
        p_publish_at: publishAt.toISOString(),
        p_user: options.userId,
      })
    : await client.rpc('cera_save_page', {
        p_page: forRpc(contentType, prepared.page),
        p_expected_version: options.expectedVersion,
        p_publish: options.mode === 'publish',
        p_user: options.userId,
      });
  return finishSave(contentType, prepared, data, error, options.mode === 'publish' ? 'published' : 'draft');
}

/** Maps a save rpc's outcome to a SaveResult and runs the content type's `afterSave`. */
async function finishSave(
  contentType: AnyContentType,
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

  const afterSave = contentType.hooks?.afterSave;
  if (afterSave) {
    try {
      const { page } = readPage(contentType, prepared.page, { status });
      await afterSave(page);
    } catch (hookError) {
      console.error(`cera: afterSave failed for page ${saved.id}`, hookError);
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
  /**
   * `live`: unpublish it first. `conflict`: someone saved it after the caller
   * loaded it. `in-use`: other records depend on it (a form's submissions).
   */
  | { ok: false; reason: 'live' | 'conflict' | 'forbidden' | 'not-found' | 'in-use'; message: string };

const DELETE_REASONS: Record<string, 'live' | 'conflict' | 'forbidden' | 'not-found' | 'in-use'> = {
  CE422: 'live',
  '23503': 'in-use',
  '23001': 'in-use',
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
export async function deletePage(client: SupabaseClient, pageId: string, options: { expectedVersion: number; userId: string }): Promise<DeletePageResult> {
  const { data, error } = await client.rpc('cera_delete_page', { p_page_id: pageId, p_expected_version: options.expectedVersion, p_user: options.userId });
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
export async function pageHistory(client: SupabaseClient, pageId: string, options: { before?: number; limit?: number } = {}): Promise<PageRevision[]> {
  const { data, error } = await client.rpc('cera_page_history', { p_page_id: pageId, p_before: options.before ?? null, p_limit: options.limit ?? 30 });
  if (error) fail(error);
  return ((data as HistoryRow[] | null) ?? []).map((row) => ({
    version: row.page_version,
    kind: row.kind,
    title: row.title,
    slug: row.slug,
    live: row.is_published,
    createdAt: row.created_at,
    ...(row.created_by_email && { createdBy: row.created_by_email }),
    ...(row.scheduled_for && row.schedule_status && { schedule: { at: row.scheduled_for, status: row.schedule_status } }),
    ...(row.restored_from !== null && { restoredFrom: row.restored_from }),
  }));
}

/**
 * Restores an old version: its content becomes the working copy, saved as a
 * new draft (checked and upgraded like any draft save). The live page is
 * unchanged until someone publishes. Returns what a draft `savePage` would;
 * `not-found` when the page has no such version. Service-role client only.
 */
export async function restoreRevision<Type extends AnyContentType>(
  client: SupabaseClient,
  contentType: Type,
  pageId: string,
  version: number,
  options: { expectedVersion: number; userId: string },
): Promise<SaveResult> {
  const { data: row, error: readError } = await client
    .from('cera_page_revisions')
    .select(PAGE_COLUMNS)
    .eq('page_id', pageId)
    .eq('page_version', version)
    .maybeSingle();
  if (readError) fail(readError);
  if (!row || (row as PageRow).content_type !== contentType.name) {
    return { ok: false, reason: 'not-found', message: `This page has no version ${version}.`, issues: [] };
  }

  const prepared = await preparePageForSave(contentType, toStored(pageId, row as PageRow), { mode: 'draft' });
  if (!prepared.ok) return { ok: false, reason: 'invalid', issues: prepared.issues };

  const { data, error } = await client.rpc('cera_restore_revision', {
    p_page: forRpc(contentType, prepared.page),
    p_from: version,
    p_expected_version: options.expectedVersion,
    p_user: options.userId,
  });
  return finishSave(contentType, prepared, data, error, 'draft');
}
