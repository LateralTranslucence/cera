import type { ReactNode } from 'react';
import { AdminSidebar, type NavSection } from '@lateraltranslucence/cera/admin';
import { listPages } from '@lateraltranslucence/cera/supabase';
import { canEditContentType } from '@lateraltranslucence/cera';
import { formType, iconType, landingPage, simplePage } from '@/cera';
import { readableAdminPages } from '@/lib/admin-pages.ts';
import { canEdit, canManagePeople, type Staff } from '@/lib/auth.ts';
import { signOutAction } from './actions.ts';

export type ShellSection = 'pages' | 'simple-pages' | 'forms' | 'submissions' | 'media' | 'icons' | 'admin-pages' | 'team' | 'people' | 'account';

const ROLE_NAMES = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' } as const;

/**
 * The admin's frame: the sidebar (only what exists: Pages, Simple Pages,
 * Forms, Submissions for editors, Media, Icons, and People for admins) and the
 * main column. The lists and counts in the sidebar are read as the signed-in
 * user, like the screens they link to.
 */
export async function Shell({
  staff,
  active,
  currentPageId,
  currentTeamSlug,
  children,
}: {
  staff: Staff;
  active?: ShellSection;
  currentPageId?: string;
  /** The admin page being read under Team. */
  currentTeamSlug?: string;
  children: ReactNode;
}) {
  const [[pages, simplePages, forms, icons], teamPages] = await Promise.all([
    Promise.all([landingPage, simplePage, formType, iconType].map((contentType) => listPages(staff.client, { contentType: contentType.name }))),
    readableAdminPages(staff),
  ]);
  const team = teamPages.filter((page) => page.boxes.settings.showInMenu);
  const sections: NavSection[] = [
    {
      label: 'Content',
      items: [
        {
          label: 'Pages',
          href: '/admin',
          icon: 'pages',
          active: active === 'pages',
          count: pages!.length,
          expand: {
            defaultOpen: true,
            ...(canEditContentType(staff.role, landingPage) && { newHref: '/admin/pages/new', newLabel: 'New page' }),
            items: pages!.map((page) => ({ label: page.title || 'Untitled', href: `/admin/pages/${page.id}`, current: page.id === currentPageId })),
          },
        },
        { label: 'Simple Pages', href: '/admin/simple-pages', icon: 'article', active: active === 'simple-pages', count: simplePages!.length },
        { label: 'Forms', href: '/admin/forms', icon: 'form', active: active === 'forms', count: forms!.length },
        // Submissions are personal data: admins and editors only.
        ...(canEdit(staff.role) ? [{ label: 'Submissions', href: '/admin/submissions', icon: 'inbox' as const, active: active === 'submissions' }] : []),
      ],
    },
    {
      label: 'Library',
      items: [
        { label: 'Media', href: '/admin/media', icon: 'media', active: active === 'media' },
        { label: 'Icons', href: '/admin/icons', icon: 'shapes', active: active === 'icons', count: icons!.length },
      ],
    },
    // Admin pages, to read (theme: DO_Admin_Pages adds them to wp-admin's menu).
    ...(team.length > 0
      ? [
          {
            label: 'Team',
            items: team.map((page) => ({ label: page.title, href: `/admin/team/${page.slug}`, icon: page.boxes.settings.menuIcon, active: active === 'team' && currentTeamSlug === page.slug })),
          },
        ]
      : []),
    ...(canManagePeople(staff.role)
      ? [
          {
            label: 'Site',
            items: [
              { label: 'People', href: '/admin/users', icon: 'people' as const, active: active === 'people' },
              { label: 'Admin Pages', href: '/admin/admin-pages', icon: 'settings' as const, active: active === 'admin-pages' },
            ],
          },
        ]
      : []),
  ];

  return (
    <div className="cera-app">
      <AdminSidebar
        homeHref="/admin"
        sections={sections}
        user={{ name: staff.user.email ?? 'Signed in', role: ROLE_NAMES[staff.role] }}
        userLinks={[
          { label: 'Account', href: '/admin/account', icon: 'account' },
          { label: 'View site', href: '/', icon: 'site' },
        ]}
        signOut={signOutAction}
      />
      <main className="cera-app__main">{children}</main>
    </div>
  );
}
