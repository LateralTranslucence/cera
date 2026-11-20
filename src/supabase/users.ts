/**
 * People with access to the admin: listing accounts, adding one, and setting
 * a Cera role. All of these need the secret-key client (Supabase's auth admin
 * API), so call them only from the server, after checking that the signed-in
 * user is an admin.
 *
 * The role lives in `app_metadata.cera_role` (decision 17), which users can't
 * set themselves. Server-side checks (`cera_assert_editor`, the site's
 * requireStaff) read it fresh; a signed-in user's own session token carries a
 * copy that refreshes when they sign in again or within the hour.
 */
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { CERA_ROLES, isCeraRole, type CeraRole, type CeraUser } from '../roles.ts';
import { fail } from './errors.ts';

export { CERA_ROLE_LABELS, CERA_ROLES, isCeraRole, type CeraRole, type CeraUser } from '../roles.ts';

/** The Cera role on a Supabase user, or null when they have none. */
export function ceraRoleOf(user: Pick<User, 'app_metadata'>): CeraRole | null {
  const role = user.app_metadata?.cera_role;
  return isCeraRole(role) ? role : null;
}

export type UserResult = { ok: true; user: CeraUser } | { ok: false; message: string };
export type CreateUserResult = { ok: true; user: CeraUser; password: string } | { ok: false; message: string };

const toCeraUser = (u: User): CeraUser => ({
  id: u.id,
  email: u.email ?? '',
  role: ceraRoleOf(u),
  createdAt: u.created_at,
  lastSignInAt: u.last_sign_in_at ?? undefined,
});

/** Every account, people with a role first, then by email. */
export async function listCeraUsers(service: SupabaseClient): Promise<CeraUser[]> {
  const users: CeraUser[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(error);
    users.push(...data.users.map(toCeraUser));
    if (data.users.length < 1000) break;
  }
  const rank = (u: CeraUser) => (u.role ? CERA_ROLES.indexOf(u.role) : CERA_ROLES.length);
  return users.sort((a, b) => rank(a) - rank(b) || a.email.localeCompare(b.email));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// No 0/O, 1/l/I: the password is read off a screen and typed.
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A random temporary password: 20 characters, about 116 bits. */
export function temporaryPassword(length = 20): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
  let out = '';
  // Rejection sampling keeps every character equally likely.
  for (const b of bytes) {
    if (b < 256 - (256 % ALPHABET.length)) out += ALPHABET[b % ALPHABET.length];
    if (out.length === length) return out;
  }
  return out + temporaryPassword(length - out.length);
}

/**
 * Creates a confirmed account with a temporary password, returned once so the
 * admin can pass it on. The person changes it after signing in.
 */
export async function createCeraUser(service: SupabaseClient, input: { email: string; role: CeraRole }): Promise<CreateUserResult> {
  const email = String(input?.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, message: 'Enter an email address, like name@example.com.' };
  if (!isCeraRole(input?.role)) return { ok: false, message: 'Pick a role.' };

  const password = temporaryPassword();
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { cera_role: input.role } });
  if (error) {
    if (error.code === 'email_exists' || /already (been )?registered/i.test(error.message)) {
      return { ok: false, message: 'That email already has an account. Change its role in the list instead.' };
    }
    fail(error);
  }
  return { ok: true, user: toCeraUser(data.user!), password };
}

/**
 * Sets someone's role, or removes their access with `null`. Refuses to
 * change your own role (so an admin can't lock themselves out) and to leave
 * the site without an admin.
 */
export async function setCeraRole(
  service: SupabaseClient,
  input: { userId: string; role: CeraRole | null },
  opts: { actingUserId: string },
): Promise<UserResult> {
  const userId = String(input?.userId ?? '');
  const role = input?.role ?? null;
  if (role !== null && !isCeraRole(role)) return { ok: false, message: 'Pick a role.' };
  if (userId === opts.actingUserId) return { ok: false, message: 'You can’t change your own role. Ask another admin.' };

  const { data: found, error: getError } = await service.auth.admin.getUserById(userId);
  if (getError || !found?.user) return { ok: false, message: 'That account no longer exists.' };

  if (ceraRoleOf(found.user) === 'admin' && role !== 'admin') {
    const admins = (await listCeraUsers(service)).filter((u) => u.role === 'admin');
    if (admins.length <= 1) return { ok: false, message: 'This is the only admin. Make someone else an admin first.' };
  }

  // A null value removes the key (Supabase merges app_metadata on update).
  const { data, error } = await service.auth.admin.updateUserById(userId, { app_metadata: { cera_role: role } });
  if (error) fail(error);
  return { ok: true, user: toCeraUser(data.user!) };
}
