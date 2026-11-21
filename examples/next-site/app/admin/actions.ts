'use server';
import { redirect } from 'next/navigation';
import type { CeraRole, MediaDeleteResult, MediaItem, MediaQuery, MediaUpdate, MediaUse, MediaUploadDone, MediaUploadPrepared, MediaUploadRequest, MediaUploadResult } from '@lateraltranslucence/cera';
import type { PageOption, PageQuery, SaveInput } from '@lateraltranslucence/cera/admin';
import {
  cancelSchedule,
  createCeraUser,
  deleteMedia,
  deletePage,
  deleteSubmissions,
  finishMediaUpload,
  listMedia,
  listPages,
  mediaUsage,
  pageHistory,
  pageLinks,
  prepareMediaUpload,
  restoreRevision,
  savePage,
  setCeraRole,
  unpublishPage,
  updateMedia,
  type CreateUserResult,
  type DeletePageResult,
  type PageLink,
  type PageRevision,
  type SaveResult,
  type UserResult,
} from '@lateraltranslucence/cera/supabase';
import type { IconGlyph } from '@lateraltranslucence/cera/icons';
import type { IconSearchResult } from '@lateraltranslucence/cera/admin';
import { contentTypes } from '@/cera';
import { iconLibrary } from '@/lib/icons.ts';
import { pagesChanged } from '@lateraltranslucence/cera/next/cache';
import { requireStaff, userClient } from '@/lib/auth.ts';
import { serviceClient } from '@/lib/supabase.ts';

/**
 * Saves or publishes a page. The user id comes from the verified session,
 * never from the request; `savePage` validates, and the database re-checks
 * the user's role.
 */
export async function savePageAction(input: SaveInput): Promise<SaveResult> {
  const { user } = await requireStaff('editor');
  const ct = contentTypes.find((contentType) => contentType.name === input.page?.contentType);
  if (!ct) {
    return { ok: false, reason: 'invalid', issues: [{ severity: 'error', code: 'invalid-page', path: ['contentType'], message: 'Unknown content type.' }] };
  }
  const result = await savePage(serviceClient(), ct, input.page, { mode: input.mode, publishAt: input.publishAt, expectedVersion: input.expectedVersion, userId: user.id });
  // Publishing changes the live site; a draft save doesn't, so it keeps the cache.
  if (result.ok && input.mode === 'publish') pagesChanged();
  return result;
}

/**
 * The editor's page picker. Reads as the signed-in user (row-level security
 * decides what they see), so it never shows more than the page list does.
 */
export async function findPagesAction(query: PageQuery): Promise<PageOption[]> {
  const staff = await requireStaff();
  const known = new Map(contentTypes.map((contentType) => [contentType.name as string, contentType.label]));
  const ids = query.ids ? new Set(query.ids) : null;
  const types = query.contentTypes?.length ? new Set(query.contentTypes) : null;
  const words = (query.search ?? '').toLowerCase().split(/\s+/).filter(Boolean);

  const pages = await listPages(staff.client);
  return pages
    .filter((page) => known.has(page.contentType))
    .filter((page) => !ids || ids.has(page.id))
    .filter((page) => !types || types.has(page.contentType))
    .filter((page) => words.every((word) => `${page.title} ${page.slug}`.toLowerCase().includes(word)))
    .slice(0, ids ? undefined : 20)
    .map((page) => ({ id: page.id, title: page.title, slug: page.slug, contentType: page.contentType, contentTypeLabel: known.get(page.contentType)!, published: page.published }));
}

/**
 * The editor's icon picker: every icon set, with the site's own icons as
 * working copies (marked "Not published" until they're live). Read as the
 * signed-in user.
 */
export async function searchIconsAction(query: string): Promise<IconSearchResult> {
  const staff = await requireStaff();
  const library = iconLibrary(staff.client, true);
  return { sets: library.sets, icons: await library.search(String(query ?? '').slice(0, 100), { limit: 60 }) };
}

/** The picked icons, drawn, for the picker. */
export async function getIconsAction(values: string[]): Promise<IconGlyph[]> {
  const staff = await requireStaff();
  const wanted = (Array.isArray(values) ? values : []).filter((value): value is string => typeof value === 'string').slice(0, 50);
  return [...(await iconLibrary(staff.client, true).byValues(wanted)).values()];
}

export async function unpublishPageAction(pageId: string): Promise<void> {
  const { user } = await requireStaff('editor');
  await unpublishPage(serviceClient(), pageId, user.id);
  pagesChanged();
}

/**
 * Cancels a page's scheduled publish. Scheduling itself goes through
 * savePageAction (mode 'schedule'); the database's pg_cron job publishes it
 * when due, and the cached live page catches up within its revalidate time.
 */
export async function cancelScheduleAction(pageId: string): Promise<void> {
  const { user } = await requireStaff('editor');
  await cancelSchedule(serviceClient(), pageId, user.id);
}

/**
 * Deletes a page for good. The database refuses a live page, so nothing on
 * the live site changes and the page cache stays.
 */
export async function deletePageAction(input: { pageId: string; expectedVersion: number }): Promise<DeletePageResult> {
  const { user } = await requireStaff('editor');
  return deletePage(serviceClient(), input.pageId, { expectedVersion: input.expectedVersion, userId: user.id });
}

/** The other pages that link to a page, read as the signed-in user. */
export async function pageLinksAction(pageId: string): Promise<PageLink[]> {
  const staff = await requireStaff();
  return pageLinks(staff.client, pageId);
}

/** A page's saved versions, newest first, read as the signed-in user. */
export async function pageHistoryAction(input: { pageId: string; before?: number }): Promise<PageRevision[]> {
  const staff = await requireStaff();
  return pageHistory(staff.client, input.pageId, { before: input.before });
}

/** Restores an old version as a new draft. Drafts don't change the live site, so the cache stays. */
export async function restoreRevisionAction(input: { pageId: string; contentType: string; version: number; expectedVersion: number }): Promise<SaveResult> {
  const { user } = await requireStaff('editor');
  const ct = contentTypes.find((contentType) => contentType.name === input.contentType);
  if (!ct) return { ok: false, reason: 'not-found', message: 'Unknown content type.', issues: [] };
  return restoreRevision(serviceClient(), ct, input.pageId, input.version, { expectedVersion: input.expectedVersion, userId: user.id });
}

/** Deletes submissions: the given ids, or all of a form's. Admins and editors; the database checks again. */
export async function deleteSubmissionsAction(input: { ids?: string[]; formId?: string }): Promise<number> {
  const { user } = await requireStaff('editor');
  return deleteSubmissions(serviceClient(), { ids: input.ids, formId: input.formId, userId: user.id });
}

/**
 * Media uploads (see `finishMediaUpload` for the steps). The browser uploads
 * to Storage itself with the signed URL from the first action; the second
 * checks what arrived and records it.
 */
export async function prepareMediaUploadAction(request: MediaUploadRequest): Promise<MediaUploadPrepared> {
  await requireStaff('editor');
  return prepareMediaUpload(serviceClient(), request);
}

export async function finishMediaUploadAction(done: MediaUploadDone): Promise<MediaUploadResult> {
  const { user } = await requireStaff('editor');
  return finishMediaUpload(serviceClient(), done, { userId: user.id });
}

/** The media library, read as the signed-in user. */
export async function findMediaAction(query: MediaQuery): Promise<MediaItem[]> {
  const staff = await requireStaff();
  return listMedia(staff.client, query);
}

/** Changes a file's library alt text (the Media page). */
export async function updateMediaAction(update: MediaUpdate): Promise<MediaUploadResult> {
  const { user } = await requireStaff('editor');
  return updateMedia(serviceClient(), update, { userId: user.id });
}

/** Deletes a file no page uses. Nothing live changes, so the page cache stays. */
export async function deleteMediaAction(id: string): Promise<MediaDeleteResult> {
  const { user } = await requireStaff('editor');
  return deleteMedia(serviceClient(), id, { userId: user.id });
}

/** The pages that use a file, read as the signed-in user. */
export async function mediaUsageAction(path: string): Promise<MediaUse[]> {
  const staff = await requireStaff();
  return mediaUsage(staff.client, path);
}

/**
 * People (admins only). The acting user comes from the verified session, so
 * the "not your own role" and "last admin" guards can't be talked around.
 */
export async function createUserAction(input: { email: string; role: CeraRole }): Promise<CreateUserResult> {
  await requireStaff('admin');
  return createCeraUser(serviceClient(), input);
}

export async function setUserRoleAction(input: { userId: string; role: CeraRole | null }): Promise<UserResult> {
  const { user } = await requireStaff('admin');
  return setCeraRole(serviceClient(), input, { actingUserId: user.id });
}

export type PasswordState = { ok?: boolean; error?: string };

/** Changes the signed-in user's own password (Account page). */
export async function changePasswordAction(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const staff = await requireStaff();
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');
  if (password.length < 12) return { error: 'Use at least 12 characters.' };
  if (password !== confirm) return { error: 'The two passwords don’t match.' };
  const { error } = await staff.client.auth.updateUser({ password });
  if (error) return { error: error.code === 'same_password' ? 'That’s your current password. Pick a new one.' : error.message };
  return { ok: true };
}

export type SignInState = { error?: string };

export async function signInAction(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  const client = await userClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { error: 'That email and password don’t match an account.' };
  redirect('/admin');
}

export async function signOutAction(): Promise<void> {
  const client = await userClient();
  await client.auth.signOut();
  redirect('/admin/login');
}
