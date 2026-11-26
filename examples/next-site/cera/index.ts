/** The site's Cera content types. The admin and the routes read from here. */
import { formType as baseFormType } from '@lateraltranslucence/cera/forms';
import { iconType } from '@lateraltranslucence/cera/icons';
import { menuType } from '@lateraltranslucence/cera/menus';
import { adminPage } from './content-types/admin-page.ts';
import { landingPage } from './content-types/landing-page.ts';
import { simplePage } from './content-types/simple-page.ts';

/** Forms, edited by admins only, as in the theme (restrict_users). Editors still read submissions. */
const formType = { ...baseFormType, editRoles: ['admin'] as const };

export { adminPage, formType, iconType, landingPage, menuType, simplePage };
/**
 * Every content type, in the admin sidebar's order. Adding one here adds it
 * to the admin; one with a `route` also needs a view (cera/views.ts).
 *
 * Landing pages and simple pages have pages of their own, both at /[slug]
 * (one address scope). Forms show on them through the Form panel; icons
 * through field.icon() fields. Menus show in the site's header and footer
 * (lib/menus.ts), by their IDs: main and footer.
 */
export const contentTypes = [landingPage, simplePage, formType, iconType, menuType, adminPage] as const;

/**
 * The colors editors pick a panel background from. The first five are the
 * Developers Only theme's (api/fields/colors.php), which the import maps its
 * color names to; the last three are the demo pages' own (scripts/seed.ts).
 */
export const backgroundColors = [
  { label: 'Blue', value: '#2C25AB' },
  { label: 'Navy', value: '#0D0B33' },
  { label: 'Teal', value: '#17D6CA' },
  { label: 'White', value: '#FFFFFF' },
  { label: 'Yellow', value: '#FFB400' },
  { label: 'Espresso', value: '#2b2118' },
  { label: 'Slate', value: '#1d2a3a' },
  { label: 'Rust', value: '#5b3412' },
];
