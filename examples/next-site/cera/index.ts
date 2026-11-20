/** The site's Cera content types. The admin and the routes read from here. */
import { formType } from '@lateraltranslucence/cera/forms';
import { landingPage } from './content-types/landing-page.ts';

export { formType, landingPage };
/** Landing pages have pages of their own; forms show on them through the Form panel. */
export const contentTypes = [landingPage, formType] as const;
