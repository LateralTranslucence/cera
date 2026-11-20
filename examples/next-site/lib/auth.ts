import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { CeraRole } from '@lateraltranslucence/cera';
import { ceraRoleOf } from '@lateraltranslucence/cera/supabase';

export type StaffRole = CeraRole;
const RANK: Record<StaffRole, number> = { viewer: 1, editor: 2, admin: 3 };

/** A Supabase client acting as the signed-in user (session in cookies). */
export async function userClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server Components can't set cookies; the proxy refreshes sessions instead.
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {}
      },
    },
  });
}

export interface Staff {
  client: SupabaseClient;
  user: User;
  role: StaffRole;
}


/**
 * The signed-in staff member, verified with Supabase Auth (getUser checks the
 * token with the auth server; the cookie alone isn't trusted). Redirects to
 * the sign-in page when there is no session or the account has no Cera role.
 */
export async function requireStaff(minimum: StaffRole = 'viewer'): Promise<Staff> {
  const client = await userClient();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect('/admin/login');
  const role = ceraRoleOf(data.user);
  if (!role) redirect('/admin/login?error=no-role');
  if (RANK[role] < RANK[minimum]) redirect('/admin?error=forbidden');
  return { client, user: data.user, role };
}

export function canEdit(role: StaffRole): boolean {
  return RANK[role] >= RANK.editor;
}

/** Admins add people and set roles (the People page). */
export function canManagePeople(role: StaffRole): boolean {
  return role === 'admin';
}
