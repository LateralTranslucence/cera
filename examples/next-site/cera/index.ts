/** The site's Cera content types. The admin and the routes read from here. */
import { formType } from '@lateraltranslucence/cera/forms';
import { iconType } from '@lateraltranslucence/cera/icons';
import { landingPage } from './content-types/landing-page.ts';
import { simplePage } from './content-types/simple-page.ts';

export { formType, iconType, landingPage, simplePage };
/**
 * Landing pages and simple pages have pages of their own, both at /[slug]
 * (one address scope). Forms show on them through the Form panel; icons
 * through f.icon() fields.
 */
export const contentTypes = [landingPage, simplePage, formType, iconType] as const;
/** The types the site's /[slug] route serves. */
export const routedTypes = [landingPage, simplePage] as const;
