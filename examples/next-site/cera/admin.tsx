import 'server-only';
/**
 * The admin, and Cera's route handlers, built from this site's content types
 * (cera/index.ts) and settings. A type added to `contentTypes` gets its
 * sidebar entry, list, new and edit screens from its definition; the screens
 * themselves live in the package, so updating Cera updates them.
 *
 * Three files in app/ put it on the site:
 * - app/admin/[[...path]]/page.tsx: every admin screen (cera.Page);
 * - app/admin/layout.tsx: the admin's fonts and CSS;
 * - app/api/cera/[...path]/route.ts: forms, search, preview, cleanup, the CSV export, signing out (cera.routes).
 *
 * `screens` and `items` add this site's own: admin pages to read, under Team.
 */
import { createCera } from '@lateraltranslucence/cera/next';
import type { IconName } from '@lateraltranslucence/cera/admin';
import { contentTypes } from './index.ts';
import { readableAdminPages } from '../lib/admin-pages.ts';
import { requireStaff, userClient } from '../lib/auth.ts';
import { sendApprovalEmail, sendEmails } from '../lib/email.ts';
import { iconLibrary } from '../lib/icons.ts';
import { publicClient, serviceClient } from '../lib/supabase.ts';
import { CeraAdminClient } from './admin-client.tsx';
import { TeamScreen } from './team.tsx';

export const cera = createCera({
  contentTypes,
  auth: { requireStaff, userClient },
  publicClient,
  serviceClient,
  Client: CeraAdminClient,
  icons: iconLibrary,
  // Each form's alert and confirmation (its private Email box), sent by SMTP; see lib/email.ts.
  sendEmails,
  approvalChanged: sendApprovalEmail,
  screens: {
    team: { title: 'Team', render: (props) => <TeamScreen {...props} /> },
  },
  // Admin pages, to read (theme: DO_Admin_Pages adds them to wp-admin's menu).
  items: async (staff) =>
    (await readableAdminPages(staff))
      .filter((page) => page.boxes.settings.showInMenu)
      .map((page) => ({ key: `team:${page.slug}`, section: 'Team', label: page.title, href: `/admin/team/${page.slug}`, icon: page.boxes.settings.menuIcon as IconName })),
});
