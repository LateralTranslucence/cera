/** The site's Cera content types. The admin and the routes read from here. */
import { formType as baseFormType } from '@lateraltranslucence/cera/forms';
import { iconType } from '@lateraltranslucence/cera/icons';
import { adminPage } from './content-types/admin-page.ts';
import { landingPage } from './content-types/landing-page.ts';
import { simplePage } from './content-types/simple-page.ts';

/** Forms, edited by admins only, as in the theme (restrict_users). Editors still read submissions. */
const formType = { ...baseFormType, editRoles: ['admin'] as const };

export { adminPage, formType, iconType, landingPage, simplePage };
/**
 * Landing pages and simple pages have pages of their own, both at /[slug]
 * (one address scope). Forms show on them through the Form panel; icons
 * through field.icon() fields.
 */
export const contentTypes = [landingPage, simplePage, formType, iconType, adminPage] as const;
/** The types the site's /[slug] route serves. */
export const routedTypes = [landingPage, simplePage] as const;
