// Ported from DO_Admin_Page (class-admin-page.php) and DO_Admin_Pages: pages
// for the team, read in the admin, never on the site.
//
// Differences from the theme:
//   - Never published (publishable: false): published versions are readable
//     by anyone, so these stay working copies, read in the admin under Team.
//   - Who can read one (theme: Permissions) is a role; Show In Menu lists it
//     under Team in the sidebar, by Menu Position, with a Menu Icon from the
//     admin's own icons (the theme took a dashicon or CSS escape).
//   - "Template" (a PHP template file) is dropped: the page shows its content.
//   - Readers are limited by the admin's screens, not row-level security: any
//     signed-in staff member can read every page's working copy through the
//     API, as with other content.
import { defineContentType, field } from '@lateraltranslucence/cera';

/** Admin icons offered for the sidebar (src/admin/icons.tsx). */
export const ADMIN_PAGE_ICONS = {
  article: 'Document',
  pages: 'Page',
  form: 'Form',
  inbox: 'Inbox',
  media: 'Image',
  shapes: 'Shapes',
  people: 'People',
  settings: 'Settings',
  history: 'History',
  site: 'Globe',
} as const;

export const adminPage = defineContentType({
  name: 'admin_page',
  label: 'Admin Page',
  // theme: restrict_users => administrator
  editRoles: ['admin'],
  publishable: false,
  boxes: {
    settings: {
      readers: field.select({
        label: 'Permissions',
        note: 'Who can read it in the admin.',
        options: { viewer: 'Everyone with access', editor: 'Editors and admins', admin: 'Admins only' },
        default: 'editor',
      }),
      showInMenu: field.toggle({ label: 'Show In Menu', default: true, note: 'Lists it under Team in the sidebar.' }),
      menuPosition: field.number({ label: 'Menu Position', int: true, min: 0, note: 'Lower comes first; then by name.' }),
      menuIcon: field.select({ label: 'Menu Icon', options: ADMIN_PAGE_ICONS, default: 'article' }),
    },
    content: {
      body: field.html({ label: 'Content' }),
    },
  },
  editor: {
    pageBoxes: ['settings'],
    noun: 'admin page',
    titleLabel: 'Page name',
    slugLabel: 'Page ID',
    slugNote: 'Lowercase words joined by hyphens, e.g. “style-guide”. Its address in the admin: /admin/team/style-guide.',
  },
});
