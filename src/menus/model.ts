/**
 * Menus: what a menu's items are, how they're checked, and how they become
 * links on the live site. Shared by the server and the admin.
 *
 * An item links to a page (by id, so renaming or moving the page keeps the
 * link), to an address, or to nothing (a heading for its submenu). Items
 * nest up to the menu field's `depth`.
 */
import { z } from 'zod';
import { custom, shapeOf, type FieldMap, type FieldMeta, type InferFields } from '../fields.ts';
import type { PageResolver } from '../panel.ts';

/** How deep menus nest by default: top items and one level of submenus. */
export const DEFAULT_MENU_DEPTH = 2;
/** Most items one menu can hold, at every level together. */
export const MAX_MENU_ITEMS = 200;

/**
 * Addresses a menu may link to: web addresses, paths and anchors on this
 * site, email and phone links. Never `javascript:` or other schemes that run
 * or load something.
 */
export function isSafeMenuUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === '' || /[\u0000-\u001f]/.test(trimmed)) return false;
  if (/^(\/(?!\/)|#|\?)/.test(trimmed)) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme) return ['http', 'https', 'mailto', 'tel'].includes(scheme);
  // A bare path ("about") or a protocol-relative address ("//example.com"): neither is what an editor means.
  return false;
}

const URL_MESSAGE = 'Use a web address (https://…), a path on this site (/about), an anchor (#team), mailto: or tel:.';

/** One stored item: a stable `_id`, the link, the site's own item fields, and the items under it. */
export type MenuItem<Fields extends FieldMap = FieldMap> = {
  _id: string;
  label: string;
  /** A page's id: the link follows the page wherever it moves. */
  page?: string;
  url?: string;
  newTab: boolean;
  children: Array<MenuItem<Fields>>;
} & InferFields<Fields>;

function itemSchema(depth: number, fields: FieldMap): z.ZodType {
  return z.looseObject({
    _id: z.string(),
    label: z.string().max(200).default(''),
    page: z.string().optional(),
    url: z.string().max(2000).refine(isSafeMenuUrl, URL_MESSAGE).optional(),
    newTab: z.boolean().default(false),
    ...shapeOf(fields),
    children:
      depth > 1
        ? z.array(itemSchema(depth - 1, fields)).default([])
        : z.array(z.unknown()).max(0, 'This menu doesn’t go any deeper. Move these items up a level.').default([]),
  });
}

const countItems = (items: readonly { children?: unknown }[]): number =>
  items.reduce((total, item) => total + 1 + (Array.isArray(item.children) ? countItems(item.children as { children?: unknown }[]) : 0), 0);

export interface MenuFieldConfig {
  depth: number;
  /** The site's own fields on every item (an icon, say). */
  fields: FieldMap;
}

/**
 * A menu's items (the field kind `menu`), edited as a tree in the admin.
 * `depth` is how many levels (default 2: top items and submenus); `fields`
 * adds the site's own fields to every item.
 */
export function menuItems<const Fields extends FieldMap = {}>(options: FieldMeta & { depth?: number; fields?: Fields } = {}) {
  const depth = Math.max(1, Math.min(options.depth ?? DEFAULT_MENU_DEPTH, 4));
  const fields = (options.fields ?? {}) as Fields;
  const schema = z
    .array(itemSchema(depth, fields))
    .refine((items) => countItems(items as { children?: unknown }[]) <= MAX_MENU_ITEMS, `A menu holds at most ${MAX_MENU_ITEMS} items.`)
    .default([]) as unknown as z.ZodDefault<z.ZodType<Array<MenuItem<Fields>>>>;
  return custom<'menu', typeof schema, MenuFieldConfig>('menu', schema, options, { depth, fields });
}

/* ------------------------------------------------------------------ */
/* Links on the live site                                              */
/* ------------------------------------------------------------------ */

/** One item, ready to render: where it goes and what's under it. */
export interface MenuLink {
  id: string;
  label: string;
  /** Missing for a heading: an item that only opens its submenu. */
  href?: string;
  newTab: boolean;
  /** The item's icon as inline SVG (from the site's icon library), when it has one. */
  icon?: string;
  /** The site's own item fields, as stored. */
  fields: Record<string, unknown>;
  children: MenuLink[];
}

export interface ResolveMenuOptions {
  /** Looks up linked pages: published ones on the live site, working copies in preview. */
  pages: PageResolver;
  /** Draws icons, for an `icon` item field (`field.icon()`). */
  icons?: { byValues(values: readonly string[]): Promise<Map<string, { svg: string }>> };
}

const BUILT_IN = new Set(['_id', 'label', 'page', 'url', 'newTab', 'children']);

/**
 * Turns stored items into links. An item that links to a page the live site
 * doesn't show (unpublished, hidden or deleted) is left out, with everything
 * under it, and so is an item with neither a label nor a link. An empty
 * label shows the linked page's title.
 */
export async function resolveMenu(items: readonly MenuItem[], options: ResolveMenuOptions): Promise<MenuLink[]> {
  const pageIds: string[] = [];
  const iconValues: string[] = [];
  const walk = (list: readonly MenuItem[]) => {
    for (const item of list) {
      if (item.page) pageIds.push(item.page);
      if (typeof item.icon === 'string' && item.icon) iconValues.push(item.icon);
      walk(item.children ?? []);
    }
  };
  walk(items);

  const [pages, icons] = await Promise.all([
    pageIds.length ? options.pages.byIds([...new Set(pageIds)]) : Promise.resolve([]),
    options.icons && iconValues.length ? options.icons.byValues([...new Set(iconValues)]) : Promise.resolve(new Map<string, { svg: string }>()),
  ]);
  const byId = new Map(pages.map((page) => [page.id, page]));

  const toLinks = (list: readonly MenuItem[]): MenuLink[] =>
    list.flatMap((item) => {
      const page = item.page ? byId.get(item.page) : undefined;
      if (item.page && !page) return [];
      const href = page ? page.url : item.url && isSafeMenuUrl(item.url) ? item.url.trim() : undefined;
      const label = item.label.trim() || page?.title || '';
      const children = toLinks(item.children ?? []);
      if (!label && !href) return [];
      // A heading with nothing under it goes nowhere.
      if (!href && children.length === 0) return [];
      const icon = typeof item.icon === 'string' ? icons.get(item.icon)?.svg : undefined;
      const fields = Object.fromEntries(Object.entries(item).filter(([key]) => !BUILT_IN.has(key)));
      return [{ id: item._id, label: label || href!, ...(href && { href }), newTab: item.newTab === true, ...(icon && { icon }), fields, children }];
    });
  return toLinks(items);
}

/**
 * Whether a link is the page at `path` (or, with `within`, a page under it).
 * Ignores a trailing slash and the query. A link to an anchor (/panels#tabs)
 * is a place on the page, not the page, so it never counts.
 */
export function linksTo(href: string | undefined, path: string, within = false): boolean {
  if (!href || !href.startsWith('/') || /#./.test(href)) return false;
  const clean = (value: string) => value.replace(/[?#].*$/, '').replace(/(.)\/$/, '$1');
  const target = clean(href);
  const current = clean(path);
  return target === current || (within && target !== '/' && current.startsWith(`${target}/`));
}
