import type { ReactNode } from 'react';
import { AdminSidebar, type NavSection } from '@lateraltranslucence/cera/admin';
import { listPages } from '@lateraltranslucence/cera/supabase';
import { canEditContentType, type AnyContentType } from '@lateraltranslucence/cera';
import { formType, iconType, landingPage, simplePage } from '@/cera';
import { readableAdminPages } from '@/lib/admin-pages.ts';
import { canEdit, canManagePeople, type Staff } from '@/lib/auth.ts';
import { signOutAction } from './actions.ts';
import { placeOf } from './content.ts';

export type ShellSection = 'pages' | 'simple-pages' | 'forms' | 'submissions' | 'media' | 'icons' | 'admin-pages' | 'team' | 'people' | 'account';

const ROLE_NAMES = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' } as const;

/**
 * The admin's frame: the sidebar (only what exists: Pages, Simple Pages,
 * Forms, Submissions for editors, Media, Icons, and People for admins) and the
 * main column. Each content type under Content lists its pages, with "+ New"
 * for those who may add one. The lists and counts in the sidebar are read as the signed-in
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
  /** A content type's item: its pages listed under it, with "+ New" for those who may add one. */
  const listed = (contentType: AnyContentType, list: Array<{ id: string; title: string }>, defaultOpen = false) => {
    const place = placeOf(contentType.name);
    return {
      count: list.length,
      expand: {
        defaultOpen,
        ...(canEditContentType(staff.role, contentType) && { newHref: `${place.base}/new`, newLabel: `New ${place.noun}` }),
        items: list.map((page) => ({ label: page.title || 'Untitled', href: `${place.base}/${page.id}`, current: page.id === currentPageId })),
      },
    };
  };
  const sections: NavSection[] = [
    {
      label: 'Content',
      items: [
        {
          label: 'Pages',
          href: '/admin',
          icon: 'pages',
          active: active === 'pages',
          ...listed(landingPage, pages!, true),
        },
        { label: 'Simple Pages', href: '/admin/simple-pages', icon: 'article', active: active === 'simple-pages', ...listed(simplePage, simplePages!) },
        { label: 'Forms', href: '/admin/forms', icon: 'form', active: active === 'forms', ...listed(formType, forms!) },
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
