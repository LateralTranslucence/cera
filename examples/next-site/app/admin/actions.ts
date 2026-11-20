'use server';
import { redirect } from 'next/navigation';
import type { CeraRole, MediaDeleteResult, MediaItem, MediaQuery, MediaUpdate, MediaUse, MediaUploadDone, MediaUploadPrepared, MediaUploadRequest, MediaUploadResult } from '@lateraltranslucence/cera';
import type { PageOption, PageQuery, SaveInput } from '@lateraltranslucence/cera/admin';
import {
  cancelSchedule,
  createCeraUser,
  deleteMedia,
  finishMediaUpload,
  listMedia,
  listPages,
  mediaUsage,
  prepareMediaUpload,
  savePage,
  setCeraRole,
  unpublishPage,
  updateMedia,
  type CreateUserResult,
  type SaveResult,
  type UserResult,
} from '@lateraltranslucence/cera/supabase';
import { contentTypes } from '@/cera';
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
  const ct = contentTypes.find((c) => c.name === input.page?.contentType);
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
  const known = new Map(contentTypes.map((c) => [c.name as string, c.label]));
  const ids = query.ids ? new Set(query.ids) : null;
  const types = query.contentTypes?.length ? new Set(query.contentTypes) : null;
  const words = (query.search ?? '').toLowerCase().split(/\s+/).filter(Boolean);

  const pages = await listPages(staff.client);
  return pages
    .filter((p) => known.has(p.contentType))
    .filter((p) => !ids || ids.has(p.id))
    .filter((p) => !types || types.has(p.contentType))
    .filter((p) => words.every((w) => `${p.title} ${p.slug}`.toLowerCase().includes(w)))
    .slice(0, ids ? undefined : 20)
    .map((p) => ({ id: p.id, title: p.title, slug: p.slug, contentType: p.contentType, contentTypeLabel: known.get(p.contentType)!, published: p.published }));
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
