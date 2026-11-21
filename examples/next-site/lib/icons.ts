import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createIconLibrary, lucideIcons, type IconLibrary } from '@lateraltranslucence/cera/icons';
import { supabaseIcons } from '@lateraltranslucence/cera/supabase';

/**
 * The site's icon sets, in the order the admin's picker shows them: the
 * site's own icons (the Icon content type), then Lucide. Another set (for
 * example a Font Awesome pack, with fontAwesomeIcons) goes in this list.
 */
export function iconLibrary(client: SupabaseClient, draft: boolean): IconLibrary {
  return createIconLibrary([supabaseIcons(client, { draft }), lucideIcons]);
}
