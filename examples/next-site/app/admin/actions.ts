'use server';
/**
 * The admin's Server Actions: the package's createAdminActions, wired to this
 * site's content types, sign-in, clients and icons. Each action checks the
 * signed-in user's role itself. A 'use server' file may only export async
 * functions, hence one wrapper per action.
 */
import type { CeraRole, MediaQuery, MediaReplace, MediaUpdate, MediaUploadDone, MediaUploadRequest } from '@lateraltranslucence/cera';
import type { PageQuery, SaveInput } from '@lateraltranslucence/cera/admin';
import { createAdminActions, type PasswordState, type SignInState } from '@lateraltranslucence/cera/next';
import { pagesChanged } from '@lateraltranslucence/cera/next/cache';
import { contentTypes } from '@/cera';
import { requireStaff, userClient } from '@/lib/auth.ts';
import { iconLibrary } from '@/lib/icons.ts';
import { serviceClient } from '@/lib/supabase.ts';

export type { PasswordState, SignInState };

const actions = createAdminActions({
  contentTypes,
  staff: requireStaff,
  userClient,
  serviceClient,
  icons: (client) => iconLibrary(client, true),
  liveChanged: pagesChanged,
});

export async function savePageAction(input: SaveInput) {
  return actions.savePage(input);
}
export async function findPagesAction(query: PageQuery) {
  return actions.findPages(query);
}
export async function searchIconsAction(query: string) {
  return actions.searchIcons(query);
}
export async function getIconsAction(values: string[]) {
  return actions.getIcons(values);
}
export async function unpublishPageAction(pageId: string) {
  return actions.unpublishPage(pageId);
}
export async function cancelScheduleAction(pageId: string) {
  return actions.cancelSchedule(pageId);
}
export async function deletePageAction(input: { pageId: string; expectedVersion: number }) {
  return actions.deletePage(input);
}
export async function pageLinksAction(pageId: string) {
  return actions.pageLinks(pageId);
}
export async function pageHistoryAction(input: { pageId: string; before?: number }) {
  return actions.pageHistory(input);
}
export async function restoreRevisionAction(input: { pageId: string; contentType: string; version: number; expectedVersion: number }) {
  return actions.restoreRevision(input);
}
export async function deleteSubmissionsAction(input: { ids?: string[]; formId?: string }) {
  return actions.deleteSubmissions(input);
}
export async function prepareMediaUploadAction(request: MediaUploadRequest) {
  return actions.prepareMediaUpload(request);
}
export async function finishMediaUploadAction(done: MediaUploadDone) {
  return actions.finishMediaUpload(done);
}
export async function findMediaAction(query: MediaQuery) {
  return actions.findMedia(query);
}
export async function updateMediaAction(update: MediaUpdate) {
  return actions.updateMedia(update);
}
export async function replaceMediaAction(replace: MediaReplace) {
  return actions.replaceMedia(replace);
}
export async function deleteMediaAction(id: string) {
  return actions.deleteMedia(id);
}
export async function mediaUsageAction(path: string) {
  return actions.mediaUsage(path);
}
export async function createUserAction(input: { email: string; role: CeraRole }) {
  return actions.createUser(input);
}
export async function setUserRoleAction(input: { userId: string; role: CeraRole | null }) {
  return actions.setUserRole(input);
}
export async function changePasswordAction(previousState: PasswordState, form: FormData) {
  return actions.changePassword(previousState, form);
}
export async function signInAction(previousState: SignInState, form: FormData) {
  return actions.signIn(previousState, form);
}
export async function signOutAction() {
  return actions.signOut();
}
