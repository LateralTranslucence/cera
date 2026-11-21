/**
 * `@lateraltranslucence/cera/icons` — icons for `field.icon()` fields: the
 * bundled Lucide set, a site's own icons (the Icon content type), and any
 * other set a site plugs in (e.g. Font Awesome Pro).
 *
 *   import { createIconLibrary, iconType, lucideIcons } from '@lateraltranslucence/cera/icons';
 *   import { supabaseIcons } from '@lateraltranslucence/cera/supabase';
 *   export const contentTypes = [landingPage, iconType];
 *   const icons = createIconLibrary([supabaseIcons(client, { draft }), lucideIcons]);
 *
 * Pass the library as `loadContext.icons`, and to the admin's PageEditor
 * (through server actions) for the picker.
 */
export { escapeAttribute as attr, createIconLibrary, iconLabel, matchScore, parseIconValue, queryWords, type IconGlyph, type IconLibrary, type IconResolver, type IconSet } from './library.ts';
export { lucideIcons } from './lucide.ts';
export { fontAwesomeIcons, type FontAwesomeIcon } from './font-awesome.ts';
export { iconType, type IconType } from './icon-type.ts';
