import 'server-only';
import { cache } from 'react';
import { draftMode } from 'next/headers';
import { getMenu } from '@lateraltranslucence/cera/supabase';
import { previewedVersion } from '@lateraltranslucence/cera/next';
import { cacheLive } from '@lateraltranslucence/cera/next/cache';
import { contentTypes, menuType } from '../cera/index.ts';
import { iconLibrary } from './icons.ts';
import { publicClient, serviceClient } from './supabase.ts';

/** Live menus go through the data cache with the pages, so publishing a menu or a page it links to refreshes them. */
const liveMenu = cacheLive('menu', (slug: string) => {
  const client = publicClient();
  return getMenu(client, menuType, slug, { contentTypes, icons: iconLibrary(client, false) });
});

/**
 * The menu with this ID (the Menu ID in the admin) as links: live, or the
 * working copy in draft-mode preview (or the version History or an approval
 * asked to preview). Empty when there's no such menu.
 */
export const loadMenu = cache(async (slug: string) => {
  const { isEnabled: draft } = await draftMode();
  if (!draft) return liveMenu(slug);
  const client = serviceClient();
  return getMenu(client, menuType, slug, { contentTypes, draft: true, version: await previewedVersion(), icons: iconLibrary(client, true) });
});
