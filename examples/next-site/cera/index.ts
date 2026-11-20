/** The site's Cera content types. The admin and the routes read from here. */
import { landingPage } from './content-types/landing-page.ts';

export { landingPage };
export const contentTypes = [landingPage] as const;
