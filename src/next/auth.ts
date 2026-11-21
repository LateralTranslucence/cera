/**
 * Who is signed in to the admin: Supabase Auth with the session in cookies
 * (@supabase/ssr), and the Cera role from the account's app_metadata.
 *
 *   // lib/auth.ts
 *   import 'server-only';
 *   export const { userClient, requireStaff } = createStaffAuth({
 *     url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
 *     publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
 *   });
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { roleAtLeast, type CeraRole } from '../roles.ts';
import { ceraRoleOf } from '../supabase/users.ts';

export interface Staff {
  /** Acts as the signed-in user, so row-level security applies. */
  client: SupabaseClient;
  user: User;
  role: CeraRole;
}

export interface StaffAuthOptions {
  url: string;
  publishableKey: string;
  /** The sign-in page. Default `/admin/login`. */
  signInPath?: string;
  /** Where someone without the role a screen needs is sent. Default `/admin?error=forbidden`. */
  forbiddenPath?: string;
}

export function createStaffAuth(options: StaffAuthOptions) {
  const signInPath = options.signInPath ?? '/admin/login';
  const forbiddenPath = options.forbiddenPath ?? '/admin?error=forbidden';

  /** A Supabase client acting as the signed-in user (session in cookies). */
  async function userClient(): Promise<SupabaseClient> {
    const store = await cookies();
    return createServerClient(options.url, options.publishableKey, {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          // Server Components can't set cookies; the proxy refreshes sessions instead.
          try {
            for (const { name, value, options: cookieOptions } of list) store.set(name, value, cookieOptions);
          } catch {}
        },
      },
    });
  }

  /**
   * The signed-in staff member, verified with Supabase Auth (getUser checks
   * the token with the auth server; the cookie alone isn't trusted).
   * Redirects to sign in when there's no session or the account has no Cera
   * role, and away when the role is below `minimum`.
   */
  async function requireStaff(minimum: CeraRole = 'viewer'): Promise<Staff> {
    const client = await userClient();
    const { data } = await client.auth.getUser();
    if (!data.user) redirect(signInPath);
    const role = ceraRoleOf(data.user);
    if (!role) redirect(`${signInPath}?error=no-role`);
    if (!roleAtLeast(role, minimum)) redirect(forbiddenPath);
    return { client, user: data.user, role };
  }

  return { userClient, requireStaff, signInPath };
}

export type StaffAuth = ReturnType<typeof createStaffAuth>;
