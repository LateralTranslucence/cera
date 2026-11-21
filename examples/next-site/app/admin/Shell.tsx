import type { ReactNode } from 'react';
import { AdminSidebar, type NavSection } from '@lateraltranslucence/cera/admin';
import { listPages } from '@lateraltranslucence/cera/supabase';
import { formType, iconType, landingPage, simplePage } from '@/cera';
import { canEdit, canManagePeople, type Staff } from '@/lib/auth.ts';
import { signOutAction } from './actions.ts';

export type ShellSection = 'pages' | 'simple-pages' | 'forms' | 'submissions' | 'media' | 'icons' | 'people' | 'account';

const ROLE_NAMES = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' } as const;

/**
 * The admin's frame: the sidebar (only what exists: Pages, Simple Pages,
 * Forms, Submissions for editors, Media, Icons, and People for admins) and the
 * main column. The lists and counts in the sidebar are read as the signed-in
 * user, like the screens they link to.
 */
export async function Shell({ staff, active, currentPageId, children }: { staff: Staff; active?: ShellSection; currentPageId?: string; children: ReactNode }) {
  const [pages, simplePages, forms, icons] = await Promise.all(
    [landingPage, simplePage, formType, iconType].map((ct) => listPages(staff.client, { contentType: ct.name })),
  );
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
            ...(canEdit(staff.role) && { newHref: '/admin/pages/new', newLabel: 'New page' }),
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
    ...(canManagePeople(staff.role) ? [{ label: 'Site', items: [{ label: 'People', href: '/admin/users', icon: 'people' as const, active: active === 'people' }] }] : []),
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
