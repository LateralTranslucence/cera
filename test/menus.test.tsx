// Menus: what items may hold, saving them, turning them into links, the
// builder's tree moves, and the live-site component.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { field, type StoredPage } from '../src/index.ts';
import { defineMenuType, isSafeMenuUrl, linksTo, Menu, menuType, resolveMenu, type MenuItem, type MenuLink } from '../src/menus/index.ts';
import { addTo, canIndent, heightOf, indent, itemAt, linkedPageIds, moveTo, outdent, removeAt, type TreeItem } from '../src/menus/tree.ts';
import { getMenu, pageHistory, pageLinks, savePage, unpublishPage } from '../src/supabase/index.ts';
import { landingPage } from '../examples/next-site/cera/content-types/landing-page.ts';
import sample from '../examples/sample-page.json' with { type: 'json' };
import { addUser, createTestDb, fakeSupabase } from './support/db.ts';

let db: PGlite;
let editor: string;
let server: SupabaseClient;
let visitor: SupabaseClient;

before(async () => {
  db = await createTestDb();
  editor = await addUser(db, 'editor');
  server = fakeSupabase(db, 'service_role');
  visitor = fakeSupabase(db, 'anon');
});

const item = (id: string, extra: Partial<MenuItem> = {}): MenuItem => ({ _id: id, label: id, newTab: false, children: [], ...extra }) as MenuItem;
const menu = (slug: string, items: unknown[]): StoredPage => ({ id: crypto.randomUUID(), contentType: menuType.name, slug, title: `${slug} menu`, boxes: { menu: { items } }, panels: [] });

async function page(slug: string, mode: 'draft' | 'publish' = 'publish', title = slug) {
  const stored = structuredClone(sample) as unknown as StoredPage;
  stored.id = crypto.randomUUID();
  stored.slug = slug;
  stored.title = title;
  const result = await savePage(server, landingPage, stored, { mode, expectedVersion: 0, userId: editor });
  assert.ok(result.ok, JSON.stringify(result));
  return stored;
}

test('addresses: web, paths, anchors, email and phone; nothing that runs or leaves the scheme ambiguous', () => {
  for (const url of ['https://example.com', 'http://example.com/a?b#c', '/about', '/', '#team', '?q=1', 'mailto:a@example.com', 'tel:+15551234', 'HTTPS://EXAMPLE.COM']) assert.equal(isSafeMenuUrl(url), true, url);
  for (const url of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', 'vbscript:x', '//evil.example', 'about', '', '   ', 'java\tscript:x', '/a\nb']) assert.equal(isSafeMenuUrl(url), false, url);
});

test('saving: unsafe addresses and items too deep are refused on publish, kept in drafts; ids follow pages', async () => {
  const unsafe = menu('unsafe', [item('a', { url: 'javascript:alert(1)' })]);
  const published = await savePage(server, menuType, unsafe, { mode: 'publish', expectedVersion: 0, userId: editor });
  assert.equal(published.ok, false);
  if (!published.ok) assert.deepEqual(published.issues.map((issue) => [issue.severity, issue.path.join('.')]), [['error', 'boxes.menu.items.0.url']]);
  // A draft keeps what was typed, with a warning, so nothing is lost while the editor fixes it.
  const draft = await savePage(server, menuType, unsafe, { mode: 'draft', expectedVersion: 0, userId: editor });
  assert.ok(draft.ok);
  assert.equal((draft.page.boxes.menu as { items: MenuItem[] }).items[0]!.url, 'javascript:alert(1)');

  const tooDeep = menu('deep', [item('a', { children: [item('b', { children: [item('c')] })] })]);
  const deep = await savePage(server, menuType, tooDeep, { mode: 'publish', expectedVersion: 0, userId: editor });
  assert.equal(deep.ok, false);
  if (!deep.ok) assert.deepEqual(deep.issues.map((issue) => issue.path.join('.')), ['boxes.menu.items.0.children.0.children']);
  // A deeper menu type takes it.
  const threeLevels = defineMenuType({ depth: 3 });
  assert.equal((await savePage(server, threeLevels, { ...tooDeep, id: crypto.randomUUID(), slug: 'deep-ok' }, { mode: 'publish', expectedVersion: 0, userId: editor })).ok, true);

  // Defaults fill in, and unknown keys survive.
  const loose = await savePage(server, menuType, menu('loose', [{ _id: 'x', page: crypto.randomUUID(), extra: 1 }]), { mode: 'publish', expectedVersion: 0, userId: editor });
  assert.ok(loose.ok);
  const saved = (loose.page.boxes.menu as { items: Array<Record<string, unknown>> }).items[0]!;
  assert.deepEqual([saved.label, saved.newTab, saved.children, saved.extra], ['', false, [], 1]);
});

test('links: pages by id, titles for empty labels, and what the live site leaves out', async () => {
  const about = await page('menu-about', 'publish', 'About us');
  const draftOnly = await page('menu-draft', 'draft', 'Not yet');
  const items = [
    item('about', { label: '', page: about.id }),
    item('gone', { page: draftOnly.id, children: [item('under-gone', { url: '/x' })] }),
    item('missing', { page: crypto.randomUUID() }),
    item('heading', { label: 'More', children: [item('ext', { label: 'Docs', url: ' https://example.com ', newTab: true }), item('empty')] }),
    item('lonely-heading', { label: 'Nothing under me' }),
    item('bad', { url: 'javascript:x' }),
    item('icon', { label: 'Starred', url: '/star', icon: 'lucide:star' } as Partial<MenuItem>),
  ];
  const pages = { byIds: async (ids: readonly string[]) => (ids.includes(about.id) ? [{ id: about.id, contentType: 'landing_page', contentTypeLabel: 'Page', slug: 'menu-about', title: 'About us', url: '/menu-about' }] : []) };
  const icons = { byValues: async (values: readonly string[]) => new Map(values.map((value) => [value, { svg: `<svg data-icon="${value}"></svg>` }])) };
  const links = await resolveMenu(items, { pages, icons });
  const shape = (list: MenuLink[]): unknown => list.map((link) => [link.label, link.href ?? null, link.newTab, Boolean(link.icon), shape(link.children)]);
  assert.deepEqual(shape(links), [
    ['About us', '/menu-about', false, false, []],
    ['More', null, false, false, [['Docs', 'https://example.com', true, false, []]]],
    ['Starred', '/star', false, true, []],
  ]);
  assert.deepEqual(links[2]!.fields, { icon: 'lucide:star' });

  // From the database: the live menu for visitors, the working copy in preview.
  const header = menu('header', [item('about', { label: '', page: about.id }), item('later', { label: '', page: draftOnly.id })]);
  assert.ok((await savePage(server, menuType, header, { mode: 'publish', expectedVersion: 0, userId: editor })).ok);
  assert.ok((await savePage(server, menuType, { ...header, boxes: { menu: { items: [item('only', { label: 'Changed', url: '/changed' })] } } }, { mode: 'draft', expectedVersion: 1, userId: editor })).ok);
  const live = await getMenu(visitor, menuType, 'header', { contentTypes: [landingPage] });
  assert.deepEqual(live.map((link) => [link.label, link.href]), [['About us', '/menu-about']]);
  const preview = await getMenu(server, menuType, 'header', { contentTypes: [landingPage], draft: true });
  assert.deepEqual(preview.map((link) => [link.label, link.href]), [['Changed', '/changed']]);
  // An old version, from History's Preview.
  const old = await getMenu(server, menuType, 'header', { contentTypes: [landingPage], draft: true, version: { pageId: header.id, version: 1 } });
  assert.deepEqual(old.map((link) => link.label), ['About us', 'Not yet']);
  // Another menu's version leaves this one as it is.
  const other = await getMenu(server, menuType, 'header', { contentTypes: [landingPage], draft: true, version: { pageId: about.id, version: 1 } });
  assert.deepEqual(other.map((link) => link.label), ['Changed']);
  assert.deepEqual(await getMenu(visitor, menuType, 'no-such-menu', { contentTypes: [landingPage] }), []);

  // Unpublishing a page warns that the live menu links to it, and takes it out of the menu.
  assert.ok((await pageLinks(server, about.id)).some((link) => link.id === header.id && link.live));
  await unpublishPage(server, about.id, editor);
  assert.deepEqual(await getMenu(visitor, menuType, 'header', { contentTypes: [landingPage] }), []);
  assert.equal((await pageHistory(server, header.id)).length, 2);
});

test('the builder’s moves: up and down, into and out of submenus, within the depth', () => {
  const items: TreeItem[] = [
    { _id: 'a', children: [] },
    { _id: 'b', children: [{ _id: 'b1', children: [] }, { _id: 'b2', children: [] }] },
    { _id: 'c', children: [] },
  ];
  const ids = (list: readonly TreeItem[]): unknown => list.map((entry) => ((entry.children as TreeItem[]).length ? [entry._id, ids(entry.children as TreeItem[])] : entry._id));

  assert.deepEqual(ids(moveTo(items, [2], 0)), ['c', 'a', ['b', ['b1', 'b2']]]);
  assert.deepEqual(ids(moveTo(items, [1, 1], 0)), ['a', ['b', ['b2', 'b1']], 'c']);
  assert.deepEqual(ids(moveTo(items, [0], -1)), ids(items));
  assert.deepEqual(ids(indent(items, [2])), ['a', ['b', ['b1', 'b2', 'c']]]);
  assert.deepEqual(ids(outdent(items, [1, 0])), ['a', ['b', ['b2']], 'b1', 'c']);
  assert.deepEqual(ids(removeAt(items, [1, 0])), ['a', ['b', ['b2']], 'c']);
  assert.deepEqual(ids(addTo(items, [0], { _id: 'a1', children: [] })), [['a', ['a1']], ['b', ['b1', 'b2']], 'c']);
  assert.deepEqual(ids(addTo(items, [], { _id: 'd', children: [] })), ['a', ['b', ['b1', 'b2']], 'c', 'd']);
  assert.equal(itemAt(items, [1, 1])?._id, 'b2');

  // Depth: two levels allows a leaf under a top item, not an item that has its own children.
  assert.equal(canIndent(items, [0], 2), false); // nothing above it
  assert.equal(canIndent(items, [2], 2), true);
  assert.equal(canIndent(items, [1], 2), false); // b has children: they'd be three levels down
  assert.equal(canIndent(items, [1], 3), true);
  assert.equal(canIndent(items, [1, 1], 2), false);
  assert.equal(heightOf(items[1]), 2);
  // The original is never changed.
  assert.deepEqual(ids(items), ['a', ['b', ['b1', 'b2']], 'c']);
  assert.deepEqual(linkedPageIds([{ _id: 'x', page: 'p1', children: [{ _id: 'y', page: 'p2', children: [] }, { _id: 'z', page: '', children: [] }] }]), ['p1', 'p2']);
});

test('the live menu: current page, submenus with a button, new tabs, icons', () => {
  const links: MenuLink[] = [
    { id: 'a', label: 'About', href: '/about', newTab: false, fields: {}, children: [] },
    {
      id: 'b',
      label: 'More',
      newTab: false,
      fields: {},
      children: [
        { id: 'c', label: 'Team', href: '/about/team', newTab: false, fields: {}, children: [] },
        { id: 'd', label: 'Docs <b>', href: 'https://example.com', newTab: true, icon: '<svg></svg>', fields: {}, children: [] },
      ],
    },
  ];
  const html = renderToStaticMarkup(<Menu links={links} label="Main" currentPath="/about/team/" />);
  assert.match(html, /^<nav class="cera-menu" aria-label="Main">/);
  assert.match(html, /<li class="cera-menu__item has-children has-current"><button type="button" class="cera-menu__toggle cera-menu__link" aria-expanded="false" aria-controls="[^"]+">/);
  assert.match(html, /<a class="cera-menu__link" href="\/about\/team" aria-current="page">/);
  assert.doesNotMatch(html, /href="\/about" aria-current/);
  assert.match(html, /href="https:\/\/example.com" target="_blank" rel="noopener noreferrer"><span class="cera-menu__icon cera-icon-glyph" aria-hidden="true"><svg><\/svg><\/span><span class="cera-menu__label">Docs &lt;b&gt;<\/span>/);
  assert.equal(renderToStaticMarkup(<Menu links={[]} label="Empty" />), '');
  assert.equal(linksTo('/about', '/about/team', true), true);
  assert.equal(linksTo('/', '/about', true), false);
  assert.equal(linksTo('https://example.com/about', '/about'), false);
  assert.equal(linksTo('/panels#tabs', '/panels'), false);
  assert.equal(linksTo('/panels?x=1', '/panels/'), true);
});

test('a menu type takes the site’s own item fields', () => {
  const custom = defineMenuType({ fields: { highlight: field.toggle({ label: 'Highlight' }) } });
  const config = (custom.boxes.menu.items as unknown as { config: { depth: number; fields: Record<string, unknown> } }).config;
  assert.deepEqual([config.depth, Object.keys(config.fields)], [2, ['highlight']]);
  assert.deepEqual(Object.keys((menuType.boxes.menu.items as unknown as { config: { fields: object } }).config.fields), ['icon']);
});
