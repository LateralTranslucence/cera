import 'server-only';
import { roleAtLeast, type CeraRole } from '@lateraltranslucence/cera';
import { createStaffAuth, type Staff } from '@lateraltranslucence/cera/next';

export type StaffRole = CeraRole;
export type { Staff };

/**
 * Who is signed in: userClient() acts as them; requireStaff(minimum) returns
 * them, or redirects to sign in (no session or no Cera role) or away (role
 * too low).
 */
export const { userClient, requireStaff } = createStaffAuth({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
});

export function canEdit(role: StaffRole): boolean {
  return roleAtLeast(role, 'editor');
}

/** Admins add people, set roles (the People page) and change the settings. */
export function canManagePeople(role: StaffRole): boolean {
  return role === 'admin';
}
