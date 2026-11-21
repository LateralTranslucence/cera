import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createIconLibrary, lucideIcons, type IconGlyph, type IconLibrary, type IconResolver } from '@lateraltranslucence/cera/icons';
import { supabaseIcons } from '@lateraltranslucence/cera/supabase';
import { cacheLive } from '@lateraltranslucence/cera/next/cache';
import { publicClient } from './supabase.ts';

/**
 * The site's icon sets, in the order the admin's picker shows them: the
 * site's own icons (the Icon content type), then Lucide. A site with Font
 * Awesome Pro adds its packs here, e.g.
 *   fontAwesomeIcons({ name: 'fa-solid', label: 'Font Awesome Solid', icons: fas })
 */
export function iconLibrary(client: SupabaseClient, draft: boolean): IconLibrary {
  return createIconLibrary([supabaseIcons(client, { draft }), lucideIcons]);
}

// Live icons go through the data cache like live pages (cleared on publish).
// The cache holds plain arrays, so the Map is rebuilt after it.
const liveGlyphs = cacheLive('icons', async (values: string[]): Promise<IconGlyph[]> => [...(await iconLibrary(publicClient(), false).byValues(values)).values()]);

/** Icons for the live site: published custom icons and Lucide, cached. */
export const liveIcons: IconResolver = {
  async byValues(values) {
    const sorted = [...new Set(values)].sort();
    return new Map((await liveGlyphs(sorted)).map((glyph) => [glyph.value, glyph]));
  },
};
