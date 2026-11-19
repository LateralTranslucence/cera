'use server';
import { redirect } from 'next/navigation';
import type { SaveInput } from '@lateraltranslucence/cera/admin';
import { savePage, unpublishPage, type SaveResult } from '@lateraltranslucence/cera/supabase';
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
