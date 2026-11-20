import type { ReactNode } from 'react';
import { AdminSidebar, type NavSection } from '@lateraltranslucence/cera/admin';
import { listPages } from '@lateraltranslucence/cera/supabase';
import { formType, landingPage } from '@/cera';
import { canEdit, canManagePeople, type Staff } from '@/lib/auth.ts';
import { signOutAction } from './actions.ts';

export type ShellSection = 'pages' | 'forms' | 'submissions' | 'media' | 'people' | 'account';

const ROLE_NAMES = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' } as const;

/**
 * The admin's frame: the sidebar (only what exists: Pages, Media, and People
 * for admins) and the main column. The Pages list in the sidebar is read as
 * the signed-in user, like the Pages screen.
 */
export async function Shell({ staff, active, currentPageId, children }: { staff: Staff; active?: ShellSection; currentPageId?: string; children: ReactNode }) {
  const [pages, forms] = await Promise.all([listPages(staff.client, { contentType: landingPage.name }), listPages(staff.client, { contentType: formType.name })]);
  const sections: NavSection[] = [
    {
      label: 'Content',
      items: [
        {
          label: 'Pages',
          href: '/admin',
          icon: 'pages',
          active: active === 'pages',
          count: pages.length,
          expand: {
            defaultOpen: true,
            ...(canEdit(staff.role) && { newHref: '/admin/pages/new', newLabel: 'New page' }),
            items: pages.map((p) => ({ label: p.title || 'Untitled', href: `/admin/pages/${p.id}`, current: p.id === currentPageId })),
          },
        },
        { label: 'Forms', href: '/admin/forms', icon: 'form', active: active === 'forms', count: forms.length },
        // Submissions are personal data: admins and editors only.
        ...(canEdit(staff.role) ? [{ label: 'Submissions', href: '/admin/submissions', icon: 'inbox' as const, active: active === 'submissions' }] : []),
      ],
    },
    { label: 'Library', items: [{ label: 'Media', href: '/admin/media', icon: 'media', active: active === 'media' }] },
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
