// The Menu content type (theme: WordPress's nav menus, with the Icon field
// from DO_Menu_Custom_Fields). A menu has no page of its own: the site's code
// shows one by its ID, e.g. getMenu(…, 'main') in the header.
//
// Differences from the theme:
//   - A link to a page stores the page's id, so it follows the page when its
//     address changes, and disappears while the page isn't live.
//   - Menus are drafted, previewed, published and approved like pages, with
//     history.
//   - Locations ("main-nav", "legal-nav") are menus' IDs, not a separate setting.
import { defineContentType } from '../content-type.ts';
import { field, type FieldMap } from '../fields.ts';
import { DEFAULT_MENU_DEPTH, menuItems } from './model.ts';

/** The fields every menu item gets by default: an icon. */
export const DEFAULT_MENU_ITEM_FIELDS = {
  icon: field.icon({ label: 'Icon', note: 'Shown before the label, where the site’s design shows icons.' }),
};

/**
 * A Menu content type with your own depth and item fields:
 *
 *   export const menuType = defineMenuType({ depth: 3, fields: { ...DEFAULT_MENU_ITEM_FIELDS, highlight: field.toggle() } });
 */
export function defineMenuType<const Fields extends FieldMap = typeof DEFAULT_MENU_ITEM_FIELDS>(options: { depth?: number; fields?: Fields } = {}) {
  return defineContentType({
    name: 'cera_menu',
    label: 'Menu',
    boxes: {
      // The editor shows it as the Items card, open.
      menu: {
        items: menuItems({ label: 'Items', depth: options.depth ?? DEFAULT_MENU_DEPTH, fields: (options.fields ?? DEFAULT_MENU_ITEM_FIELDS) as Fields }),
      },
    },
    editor: {
      icon: 'menu',
      section: 'Site',
      noun: 'menu',
      itemNoun: 'item',
      titleLabel: 'Menu name',
      slugLabel: 'Menu ID',
      slugNote: 'The site’s code shows a menu by its ID, e.g. “main” in the header or “footer”. Ask your developer before changing it.',
      leadBoxes: ['menu'],
      openBoxes: ['menu'],
      // A menu shows on every page; preview it on the home page.
      previewPath: '/',
    },
  });
}

/** Menus with an icon on each item, two levels deep. */
export const menuType = defineMenuType();

export type MenuType = typeof menuType;
