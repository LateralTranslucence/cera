/** Reading a menu for the site: its live version, or its working copy in preview. */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnyContentType } from '../content-type.ts';
import type { MenuItem, MenuLink, ResolveMenuOptions } from '../menus/model.ts';
import { resolveMenu } from '../menus/model.ts';
import type { ReadOptions } from '../document.ts';
import { createPageResolver, getDraftPage, getPublishedPage, getRevisionPage } from './index.ts';

export interface GetMenuOptions extends Omit<ReadOptions, 'status'> {
  /** The site's content types: links to pages of other types are left out. */
  contentTypes: readonly AnyContentType[];
  /** The working copy, and pages' working copies (draft-mode preview). Needs a client that can read them. */
  draft?: boolean;
  /** Draws item icons (see createIconLibrary). */
  icons?: ResolveMenuOptions['icons'];
  /**
   * With `draft`: show this saved version instead of the working copy, when
   * it's a version of this menu (History's and approvals' Preview; see
   * previewedVersion). Other menus show their working copies.
   */
  version?: { pageId: string; version: number } | null;
}

/**
 * The menu with this ID (its slug), as links. Empty when there's no such
 * menu, or it isn't live. Plain data, so it can be cached (cacheLive).
 */
export async function getMenu(client: SupabaseClient, menuType: AnyContentType, slug: string, options: GetMenuOptions): Promise<MenuLink[]> {
  const read = options.draft ? getDraftPage : getPublishedPage;
  let found = await read(client, menuType, slug, { onIssue: options.onIssue });
  if (options.draft && options.version && found?.page.id === options.version.pageId) {
    found = (await getRevisionPage(client, [menuType], options.version.pageId, options.version.version, { onIssue: options.onIssue })) ?? found;
  }
  const items = ((found?.page.boxes as { menu?: { items?: MenuItem[] } } | undefined)?.menu?.items ?? []) as MenuItem[];
  return resolveMenu(items, { pages: createPageResolver(client, options.contentTypes, { draft: options.draft === true }), icons: options.icons });
}
