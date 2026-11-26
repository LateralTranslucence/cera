/**
 * The admin's Server Actions, ready made. Each one checks who is signed in
 * (`staff`), the role it needs and, for pages, the content type's
 * `editRoles`, then does the work: writes go through the secret-key client
 * with the verified user's id, reads go through the user's own client so
 * row-level security applies.
 *
 * A 'use server' file may only export async functions, so a site wraps them:
 *
 *   // app/admin/actions.ts
 *   'use server';
 *   const actions = createAdminActions({ contentTypes, staff: requireStaff, userClient, serviceClient, icons, liveChanged: pagesChanged });
 *   export async function savePageAction(input: SaveInput) { return actions.savePage(input); }
 *   …
 *
 * createCera (cera.tsx) sets this up for a site; use it directly only to
 * build an admin by hand.
 */
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnyContentType } from '../content-type.ts';
import { approvalRights, type ApprovalNotice, type ApprovalSettings, type PageApproval } from '../approvals.ts';
import { canEditContentType, type CeraRole } from '../roles.ts';
import type { PageOption, PageQuery } from '../admin/fields.tsx';
import type { SaveInput } from '../admin/PageEditor.tsx';
import type { IconSearchResult } from '../admin/icon-inputs.tsx';
import type { IconGlyph, IconLibrary } from '../icons/index.ts';
import type { MediaDeleteResult, MediaItem, MediaQuery, MediaReplace, MediaReplaceResult, MediaUpdate, MediaUploadDone, MediaUploadPrepared, MediaUploadRequest, MediaUploadResult, MediaUse } from '../media.ts';
import {
  cancelSchedule,
  createCeraUser,
  decideApproval,
  deleteMedia,
  deletePage,
  deleteSubmissions,
  finishMediaUpload,
  getApprovalPage,
  getApprovalSettings,
  getPageApproval,
  listCeraUsers,
  listMedia,
  listPages,
  mediaUsage,
  pageHistory,
  pageLinks,
  prepareMediaUpload,
  replaceMedia,
  restoreRevision,
  saveApprovalSettings,
  savePage,
  setCeraRole,
  unpublishPage,
  updateMedia,
  withdrawApproval,
  type ApprovalDecision,
  type CreateUserResult,
  type DecisionResult,
  type DeletePageResult,
  type PageLink,
  type PageRevision,
  type SaveResult,
  type SettingsResult,
  type UserResult,
} from '../supabase/index.ts';
import type { Staff } from './auth.ts';

export interface AdminActionsOptions {
  contentTypes: readonly AnyContentType[];
  /** The signed-in staff member with at least this role. Refuses (redirect() or throw) otherwise: see createStaffAuth. */
  staff: (minimum?: CeraRole) => Promise<Staff>;
  /** A client acting as whoever is (or is about to be) signed in, for signing in and out. */
  userClient: () => Promise<SupabaseClient>;
  /** The secret-key client, for writes. Server only. */
  serviceClient: () => SupabaseClient;
  /** The site's icon sets for the picker, with the site's own icons as working copies (see createIconLibrary). */
  icons?: (client: SupabaseClient) => IconLibrary;
  /** Called after a change to the live site (publish, unpublish), e.g. pagesChanged() from ./next/cache. */
  liveChanged?: () => void;
  /**
   * Called after a page is submitted, passed to the next tier, approved or
   * sent back, with the people to tell, e.g. to email them (see
   * `approvalEmail`). Runs after the response has gone; an error is logged.
   */
  approvalChanged?: (notice: ApprovalNotice) => void | Promise<void>;
  /** Where signing in and out lead. Defaults `/admin` and `/admin/login`. */
  paths?: { afterSignIn?: string; signIn?: string };
}

/** A decision's outcome, with the page's request as it is now (null once approved). */
export type DecideResult = (Extract<DecisionResult, { ok: true }> & { approval: PageApproval | null }) | Extract<DecisionResult, { ok: false }>;

export type PasswordState = { ok?: boolean; error?: string };
export type SignInState = { error?: string };

/** Why someone can't change pages of a type limited to other roles (a content type's editRoles). */
function notYours(contentType: AnyContentType): string {
  return `Only ${(contentType.editRoles ?? []).map((role: CeraRole) => `${role}s`).join(' and ')} can change ${contentType.label.toLowerCase()} pages.`;
}

export function createAdminActions(options: AdminActionsOptions) {
  const { contentTypes, staff, serviceClient } = options;
  const liveChanged = () => options.liveChanged?.();
  const byName = (name: unknown) => contentTypes.find((candidate) => candidate.name === name);

  /** The content type of a stored page, read as the signed-in user; null for an unknown page or type. */
  async function contentTypeOfPage(member: Staff, pageId: string): Promise<AnyContentType | null> {
    const { data } = await member.client.from('cera_pages').select('content_type').eq('id', pageId).maybeSingle();
    return byName((data as { content_type?: string } | null)?.content_type) ?? null;
  }

  /** The staff member, if they may change this page; throws otherwise. */
  async function editorOfPage(pageId: string): Promise<Staff> {
    const member = await staff('editor');
    const contentType = await contentTypeOfPage(member, pageId);
    if (!contentType || !canEditContentType(member.role, contentType)) throw new Error(contentType ? notYours(contentType) : 'Page not found.');
    return member;
  }

  /** Tells the people concerned about a request, once the response has gone. */
  function notify(member: Staff, contentType: AnyContentType, pageId: string, notice: Pick<ApprovalNotice, 'action' | 'version' | 'comment' | 'at'>, submittedBy?: string): void {
    const tell = options.approvalChanged;
    if (!tell) return;
    const task = async () => {
      try {
        const service = serviceClient();
        const [users, approval, page] = await Promise.all([
          listCeraUsers(service),
          getPageApproval(service, pageId),
          service.from('cera_pages').select('title').eq('id', pageId).maybeSingle(),
        ]);
        const waiting = notice.action === 'submitted' || notice.action === 'approved';
        // Decided or replaced since: whatever did that tells people itself.
        if (waiting && approval?.status !== 'pending') return;
        const settings = waiting ? (await getApprovalSettings(service)).settings : null;
        const others = users.filter((user) => user.email && user.id !== member.user.id);
        const approvers = waiting ? others.filter((user) => approvalRights(user, contentType, settings!, approval!).decide) : [];
        // The tier it waits for; those above only when nobody has that role.
        const tier = approvers.filter((user) => user.role === approval!.awaiting);
        const recipients = !waiting ? others.filter((user) => user.id === submittedBy) : tier.length > 0 ? tier : approvers;
        await tell({
          ...notice,
          page: { id: pageId, title: String((page.data as { title?: string } | null)?.title ?? ''), contentType: contentType.name, contentTypeLabel: contentType.label },
          ...(member.user.email && { by: member.user.email }),
          ...(waiting && { awaiting: approval!.awaiting }),
          to: recipients.map((user) => user.email),
        });
      } catch (error) {
        console.error('cera: approvalChanged failed', error);
      }
    };
    try {
      after(task);
    } catch {
      // Outside a Next request (a script, a test), straight away.
      void task();
    }
  }

  function iconLibrary(client: SupabaseClient): IconLibrary {
    if (!options.icons) throw new Error('This site has no icon sets (createAdminActions: icons).');
    return options.icons(client);
  }

  return {
    /**
     * Saves, submits, publishes or schedules a page. The user id comes from
     * the verified session, never from the request; savePage validates, and
     * the database re-checks the user's role and the approval settings.
     */
    async savePage(input: SaveInput): Promise<SaveResult> {
      const member = await staff('author');
      const { user, role } = member;
      const contentType = byName(input.page?.contentType);
      if (!contentType) return { ok: false, reason: 'invalid', issues: [{ severity: 'error', code: 'invalid-page', path: ['contentType'], message: 'Unknown content type.' }] };
      if (!canEditContentType(role, contentType)) return { ok: false, reason: 'forbidden', message: notYours(contentType), issues: [] };
      const result = await savePage(serviceClient(), contentType, input.page, { mode: input.mode, publishAt: input.publishAt, note: input.note, expectedVersion: input.expectedVersion, userId: user.id });
      // Publishing changes the live site; a draft save doesn't, so it keeps the cache.
      if (result.ok && input.mode === 'publish') liveChanged();
      if (result.ok && input.mode === 'submit') {
        notify(member, contentType, result.id, { action: 'submitted', version: result.version, comment: input.note, at: input.publishAt });
        const approval = await getPageApproval(member.client, result.id);
        return { ...result, ...(approval && { approval }) };
      }
      return result;
    },

    /**
     * Approves a page's request (passing it on, or publishing or scheduling
     * the submitted version) or sends it back. The database checks the role
     * against the approval settings.
     */
    async decideApproval(input: ApprovalDecision): Promise<DecideResult> {
      const member = await staff('editor');
      const request = await getApprovalPage(member.client, input?.approvalId);
      const contentType = byName(request?.contentType);
      if (!request || !contentType) return { ok: false, reason: 'not-found', message: 'This request no longer exists.' };
      if (!canEditContentType(member.role, contentType)) return { ok: false, reason: 'forbidden', message: notYours(contentType) };
      const result = await decideApproval(serviceClient(), input, { userId: member.user.id });
      if (!result.ok) return result;
      if (result.outcome === 'published') liveChanged();
      notify(
        member,
        contentType,
        result.pageId,
        { action: result.outcome, version: result.version, comment: input.comment, ...(result.outcome === 'scheduled' && { at: input.publishAt }) },
        request.submittedBy,
      );
      return { ...result, approval: await getPageApproval(member.client, result.pageId) };
    },

    /** Takes the signed-in user's own request back. */
    async withdrawApproval(approvalId: string): Promise<{ ok: true } | Extract<DecisionResult, { ok: false }>> {
      const { user } = await staff('author');
      return withdrawApproval(serviceClient(), approvalId, { userId: user.id });
    },

    /** Saves the approval settings (admins only). Types this site doesn't have, or never publishes, are left out. */
    async saveApprovalSettings(input: { settings: ApprovalSettings; expectedVersion: number }): Promise<SettingsResult> {
      const { user } = await staff('admin');
      const tiers = Object.fromEntries(Object.entries(input.settings?.tiers ?? {}).filter(([name]) => byName(name) && byName(name)!.publishable !== false));
      return saveApprovalSettings(serviceClient(), { tiers, someoneElse: input.settings?.someoneElse === true }, { expectedVersion: Number(input.expectedVersion), userId: user.id });
    },

    /** The editor's page picker, read as the signed-in user: it never shows more than the page list does. */
    async findPages(query: PageQuery): Promise<PageOption[]> {
      const member = await staff();
      const known = new Map(contentTypes.map((contentType) => [contentType.name as string, contentType.label]));
      const ids = query.ids ? new Set(query.ids) : null;
      const types = query.contentTypes?.length ? new Set(query.contentTypes) : null;
      const words = (query.search ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      return (await listPages(member.client))
        .filter((page) => known.has(page.contentType))
        .filter((page) => !ids || ids.has(page.id))
        .filter((page) => !types || types.has(page.contentType))
        .filter((page) => words.every((word) => `${page.title} ${page.slug}`.toLowerCase().includes(word)))
        .slice(0, ids ? undefined : 20)
        .map((page) => ({ id: page.id, title: page.title, slug: page.slug, contentType: page.contentType, contentTypeLabel: known.get(page.contentType)!, published: page.published }));
    },

    /** The icon picker: every icon set, with the site's own icons as working copies. */
    async searchIcons(query: string): Promise<IconSearchResult> {
      const member = await staff();
      const library = iconLibrary(member.client);
      return { sets: library.sets, icons: await library.search(String(query ?? '').slice(0, 100), { limit: 60 }) };
    },

    /** The picked icons, drawn, for the picker. */
    async getIcons(values: string[]): Promise<IconGlyph[]> {
      const member = await staff();
      const wanted = (Array.isArray(values) ? values : []).filter((value): value is string => typeof value === 'string').slice(0, 50);
      return [...(await iconLibrary(member.client).byValues(wanted)).values()];
    },

    async unpublishPage(pageId: string): Promise<void> {
      const { user } = await editorOfPage(pageId);
      await unpublishPage(serviceClient(), pageId, user.id);
      liveChanged();
    },

    /** Cancels a scheduled publish. The database's pg_cron job publishes when due. */
    async cancelSchedule(pageId: string): Promise<void> {
      const { user } = await editorOfPage(pageId);
      await cancelSchedule(serviceClient(), pageId, user.id);
    },

    /** Deletes a page for good. The database refuses a live page, so the live site doesn't change. */
    async deletePage(input: { pageId: string; expectedVersion: number }): Promise<DeletePageResult> {
      const member = await staff('editor');
      const contentType = await contentTypeOfPage(member, input.pageId);
      if (!contentType) return { ok: false, reason: 'not-found', message: 'Page not found.' };
      if (!canEditContentType(member.role, contentType)) return { ok: false, reason: 'forbidden', message: notYours(contentType) };
      return deletePage(serviceClient(), input.pageId, { expectedVersion: input.expectedVersion, userId: member.user.id });
    },

    /** The other pages that link to a page, read as the signed-in user. */
    async pageLinks(pageId: string): Promise<PageLink[]> {
      return pageLinks((await staff()).client, pageId);
    },

    /** A page's saved versions, newest first, read as the signed-in user. */
    async pageHistory(input: { pageId: string; before?: number }): Promise<PageRevision[]> {
      return pageHistory((await staff()).client, input.pageId, { before: input.before });
    },

    /** Restores an old version as a new draft. */
    async restoreRevision(input: { pageId: string; contentType: string; version: number; expectedVersion: number }): Promise<SaveResult> {
      const { user, role } = await staff('author');
      // restoreRevision checks that the page really is this type.
      const contentType = byName(input.contentType);
      if (!contentType) return { ok: false, reason: 'not-found', message: 'Unknown content type.', issues: [] };
      if (!canEditContentType(role, contentType)) return { ok: false, reason: 'forbidden', message: notYours(contentType), issues: [] };
      return restoreRevision(serviceClient(), contentType, input.pageId, input.version, { expectedVersion: input.expectedVersion, userId: user.id });
    },

    /** Deletes submissions: the given ids, or all of a form's. The database checks the role again. */
    async deleteSubmissions(input: { ids?: string[]; formId?: string }): Promise<number> {
      const { user } = await staff('editor');
      return deleteSubmissions(serviceClient(), { ids: input.ids, formId: input.formId, userId: user.id });
    },

    /** Media uploads, step one: a signed URL the browser uploads to. */
    async prepareMediaUpload(request: MediaUploadRequest): Promise<MediaUploadPrepared> {
      await staff('author');
      return prepareMediaUpload(serviceClient(), request);
    },

    /** Media uploads, step two: checks what arrived and records it. */
    async finishMediaUpload(done: MediaUploadDone): Promise<MediaUploadResult> {
      const { user } = await staff('author');
      return finishMediaUpload(serviceClient(), done, { userId: user.id });
    },

    /** The media library, read as the signed-in user. */
    async findMedia(query: MediaQuery): Promise<MediaItem[]> {
      return listMedia((await staff()).client, query);
    },

    /** Changes a file's library alt text. */
    async updateMedia(update: MediaUpdate): Promise<MediaUploadResult> {
      const { user } = await staff('editor');
      return updateMedia(serviceClient(), update, { userId: user.id });
    },

    /** Replaces a file with a new upload; every page that uses it, live ones included, shows the new one. */
    async replaceMedia(replace: MediaReplace): Promise<MediaReplaceResult> {
      const { user } = await staff('editor');
      const result = await replaceMedia(serviceClient(), replace, { userId: user.id });
      if (result.ok && result.pages > 0) liveChanged();
      return result;
    },

    /** Deletes a file no page uses. */
    async deleteMedia(id: string): Promise<MediaDeleteResult> {
      const { user } = await staff('editor');
      return deleteMedia(serviceClient(), id, { userId: user.id });
    },

    /** The pages that use a file, read as the signed-in user. */
    async mediaUsage(path: string): Promise<MediaUse[]> {
      return mediaUsage((await staff()).client, path);
    },

    /** Adds a person (admins only). */
    async createUser(input: { email: string; role: CeraRole }): Promise<CreateUserResult> {
      await staff('admin');
      return createCeraUser(serviceClient(), input);
    },

    /** Sets a person's role (admins only). The acting user comes from the session, so "not your own role" and "last admin" can't be talked around. */
    async setUserRole(input: { userId: string; role: CeraRole | null }): Promise<UserResult> {
      const { user } = await staff('admin');
      return setCeraRole(serviceClient(), input, { actingUserId: user.id });
    },

    /** Changes the signed-in user's own password (a form action: useActionState). */
    async changePassword(_previousState: PasswordState, form: FormData): Promise<PasswordState> {
      const member = await staff();
      const password = String(form.get('password') ?? '');
      const confirm = String(form.get('confirm') ?? '');
      if (password.length < 12) return { error: 'Use at least 12 characters.' };
      if (password !== confirm) return { error: 'The two passwords don’t match.' };
      const { error } = await member.client.auth.updateUser({ password });
      if (error) return { error: error.code === 'same_password' ? 'That’s your current password. Pick a new one.' : error.message };
      return { ok: true };
    },

    /** Signs in with email and password (a form action: useActionState). */
    async signIn(_previousState: SignInState, form: FormData): Promise<SignInState> {
      const email = String(form.get('email') ?? '');
      const password = String(form.get('password') ?? '');
      const { error } = await (await options.userClient()).auth.signInWithPassword({ email, password });
      if (error) return { error: 'That email and password don’t match an account.' };
      redirect(options.paths?.afterSignIn ?? '/admin');
    },

    async signOut(): Promise<void> {
      await (await options.userClient()).auth.signOut();
      redirect(options.paths?.signIn ?? '/admin/login');
    },
  };
}

export type AdminActions = ReturnType<typeof createAdminActions>;
