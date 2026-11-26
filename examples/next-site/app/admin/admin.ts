import 'server-only';
/**
 * The admin's screens: the package's createAdminScreens, built from this
 * site's content types. A type added to `contentTypes` (cera/index.ts) gets
 * its sidebar entry, list, new and edit screens from its definition.
 *
 * `items` adds this site's own screens to the sidebar: Approvals,
 * Submissions, Media, People, Settings, and the admin pages listed under Team.
 */
import { createAdminScreens, type AdminItem, type AdminScreens } from '@lateraltranslucence/cera/next';
import type { IconName } from '@lateraltranslucence/cera/admin';
import { contentTypes } from '@/cera';
import { readableAdminPages } from '@/lib/admin-pages.ts';
import { canEdit, canManagePeople, requireStaff } from '@/lib/auth.ts';
import { signOutAction } from './actions.ts';
import { EditorClient } from './EditorClient.tsx';

export const admin: AdminScreens = createAdminScreens({
  contentTypes,
  requireStaff,
  Editor: EditorClient,
  signOut: signOutAction,
  items: async (staff): Promise<AdminItem[]> => {
    // Admin pages, to read (theme: DO_Admin_Pages adds them to wp-admin's menu).
    const team = (await readableAdminPages(staff)).filter((page) => page.boxes.settings.showInMenu);
    return [
      ...(await admin.approvalsItem(staff)),
      // Submissions are personal data: admins and editors only.
      ...(canEdit(staff.role) ? [{ key: 'submissions', section: 'Content', label: 'Submissions', href: '/admin/submissions', icon: 'inbox' as const, after: 'forms' }] : []),
      { key: 'media', section: 'Library', label: 'Media', href: '/admin/media', icon: 'media', before: 'icons' },
      ...team.map((page) => ({ key: `team:${page.slug}`, section: 'Team', label: page.title, href: `/admin/team/${page.slug}`, icon: page.boxes.settings.menuIcon as IconName })),
      ...(canManagePeople(staff.role) ? [{ key: 'people', section: 'Site', label: 'People', href: '/admin/users', icon: 'people' as const, before: 'admin-pages' }] : []),
      ...(canManagePeople(staff.role) ? [{ key: 'settings', section: 'Site', label: 'Settings', href: '/admin/settings', icon: 'sliders' as const }] : []),
    ];
  },
});
