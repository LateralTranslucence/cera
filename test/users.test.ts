// Managing people: listing, adding with a temporary password, setting roles, and the lockout guards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CERA_ROLES, ceraRoleOf, createCeraUser, listCeraUsers, setCeraRole, temporaryPassword } from '../src/supabase/index.ts';

interface FakeUser {
  id: string;
  email: string;
  app_metadata: Record<string, unknown>;
  created_at: string;
  last_sign_in_at?: string;
  password?: string;
}

/** Supabase's auth admin API, in memory. app_metadata merges on update and a null value removes a key, as in GoTrue. */
function fakeAuthentication(seed: Array<Pick<FakeUser, 'email'> & { role?: string }> = []) {
  const users: FakeUser[] = seed.map((seedUser, i) => ({
    id: `u${i}`,
    email: seedUser.email,
    app_metadata: seedUser.role ? { provider: 'email', cera_role: seedUser.role } : { provider: 'email' },
    created_at: '2026-11-01T00:00:00Z',
  }));
  const admin = {
    async listUsers({ page = 1, perPage = 50 } = {}) {
      return { data: { users: users.slice((page - 1) * perPage, page * perPage) }, error: null };
    },
    async getUserById(id: string) {
      const user = users.find((existingUser) => existingUser.id === id);
      return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'User not found', code: 'user_not_found' } };
    },
    async createUser(attributes: { email: string; password: string; email_confirm: boolean; app_metadata: Record<string, unknown> }) {
      if (users.some((existingUser) => existingUser.email === attributes.email)) {
        return { data: { user: null }, error: { message: 'A user with this email address has already been registered', code: 'email_exists' } };
      }
      const user: FakeUser = { id: `u${users.length}`, email: attributes.email, password: attributes.password, app_metadata: { provider: 'email', ...attributes.app_metadata }, created_at: '2026-11-20T00:00:00Z' };
      users.push(user);
      return { data: { user }, error: null };
    },
    async updateUserById(id: string, attributes: { app_metadata?: Record<string, unknown> }) {
      const user = users.find((existingUser) => existingUser.id === id)!;
      for (const [key, value] of Object.entries(attributes.app_metadata ?? {})) {
        if (value === null) delete user.app_metadata[key];
        else user.app_metadata[key] = value;
      }
      return { data: { user }, error: null };
    },
  };
  return { users, client: { auth: { admin } } as unknown as SupabaseClient };
}

test('temporary passwords: long, unambiguous characters, different every time', () => {
  const password = temporaryPassword();
  assert.equal(password.length, 20);
  assert.match(password, /^[a-km-zA-HJ-NP-Z2-9]+$/);
  assert.notEqual(password, temporaryPassword());
});

test('the list puts people with access first, by role, then everyone else', async () => {
  const { client } = fakeAuthentication([{ email: 'zed@cera.test' }, { email: 'eve@cera.test', role: 'editor' }, { email: 'amy@cera.test', role: 'admin' }, { email: 'bob@cera.test', role: 'viewer' }, { email: 'odd@cera.test', role: 'owner' }]);
  const list = await listCeraUsers(client);
  assert.deepEqual(
    list.map((user) => [user.email, user.role]),
    [
      ['amy@cera.test', 'admin'],
      ['eve@cera.test', 'editor'],
      ['bob@cera.test', 'viewer'],
      ['odd@cera.test', null], // not a Cera role
      ['zed@cera.test', null],
    ],
  );
  assert.deepEqual([...CERA_ROLES], ['admin', 'editor', 'author', 'viewer']);
});

test('adding someone creates a confirmed account with the role and returns the password once', async () => {
  const { client, users } = fakeAuthentication([{ email: 'amy@cera.test', role: 'admin' }]);
  const added = await createCeraUser(client, { email: '  New.Person@Example.COM ', role: 'editor' });
  assert.equal(added.ok, true, JSON.stringify(added));
  if (!added.ok) return;
  assert.equal(added.user.email, 'new.person@example.com');
  assert.equal(added.user.role, 'editor');
  assert.equal(users.at(-1)?.password, added.password);
  assert.equal(added.password.length, 20);

  const again = await createCeraUser(client, { email: 'new.person@example.com', role: 'viewer' });
  assert.deepEqual(again, { ok: false, message: 'That email already has an account. Change its role in the list instead.' });
  assert.equal((await createCeraUser(client, { email: 'not an email', role: 'editor' })).ok, false);
  assert.equal((await createCeraUser(client, { email: 'x@y.test', role: 'owner' as 'admin' })).ok, false);
});

test('roles change and access can be removed; the role key is deleted, other metadata kept', async () => {
  const { client, users } = fakeAuthentication([{ email: 'amy@cera.test', role: 'admin' }, { email: 'eve@cera.test', role: 'editor' }]);
  const promoted = await setCeraRole(client, { userId: 'u1', role: 'admin' }, { actingUserId: 'u0' });
  assert.equal(promoted.ok && promoted.user.role, 'admin');
  const removed = await setCeraRole(client, { userId: 'u1', role: null }, { actingUserId: 'u0' });
  assert.equal(removed.ok && removed.user.role, null);
  assert.deepEqual(users[1]!.app_metadata, { provider: 'email' });
  assert.equal(ceraRoleOf(users[1]!), null);
});

test('guards: not your own role, not the last admin, not an unknown role or account', async () => {
  const { client } = fakeAuthentication([{ email: 'amy@cera.test', role: 'admin' }, { email: 'eve@cera.test', role: 'admin' }, { email: 'bob@cera.test', role: 'editor' }]);
  const own = await setCeraRole(client, { userId: 'u0', role: 'editor' }, { actingUserId: 'u0' });
  assert.deepEqual(own, { ok: false, message: 'You can’t change your own role. Ask another admin.' });

  // Two admins: one can be demoted, then the other is the last.
  assert.equal((await setCeraRole(client, { userId: 'u1', role: 'editor' }, { actingUserId: 'u2' })).ok, true);
  const last = await setCeraRole(client, { userId: 'u0', role: null }, { actingUserId: 'u2' });
  assert.deepEqual(last, { ok: false, message: 'This is the only admin. Make someone else an admin first.' });

  assert.equal((await setCeraRole(client, { userId: 'u2', role: 'owner' as 'admin' }, { actingUserId: 'u0' })).ok, false);
  assert.equal((await setCeraRole(client, { userId: 'nobody', role: 'editor' }, { actingUserId: 'u0' })).ok, false);
});
