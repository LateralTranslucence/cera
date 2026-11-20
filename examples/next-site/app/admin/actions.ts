'use server';
import { redirect } from 'next/navigation';
import type { PageOption, PageQuery, SaveInput } from '@lateraltranslucence/cera/admin';
import { listPages, savePage, unpublishPage, type SaveResult } from '@lateraltranslucence/cera/supabase';
import { contentTypes } from '@/cera';
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
  return savePage(serviceClient(), ct, input.page, { mode: input.mode, expectedVersion: input.expectedVersion, userId: user.id });
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
