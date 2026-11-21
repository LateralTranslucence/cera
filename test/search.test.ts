// The Search panel: settings from its fields, queries from the URL, the
// resolver against stored pages, the route handler, and the panel itself.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readPage, type StoredPage } from '../src/index.ts';
import { createSearchHandler, Panels } from '../src/next/index.ts';
import { parseSearchQuery, searchQueryParams, searchSettingsOf, type SearchSettings } from '../src/panels/index.ts';
import { createSearchResolver, savePage, unpublishPage } from '../src/supabase/index.ts';
import { landingPage } from '../examples/next-site/cera/content-types/landing-page.ts';
import { simplePage } from '../examples/next-site/cera/content-types/simple-page.ts';
import { addUser, createTestDb, fakeSupabase } from './support/db.ts';

const contentTypes = [landingPage, simplePage] as const;

/** Search panel data, as readPage would fill it in. */
function panelData(data: Record<string, unknown> = {}) {
  const raw: StoredPage = { id: crypto.randomUUID(), contentType: landingPage.name, slug: 'x', title: 'x', boxes: {}, panels: [{ id: 'search', type: 'cera/search', v: 1, data }] };
  const { page } = readPage(landingPage, raw);
  return page.panels[0]!.data as Parameters<typeof searchSettingsOf>[0];
}

test('settings: defaults, the theme’s field types, and sort orders offered once each', () => {
  const settings = searchSettingsOf(panelData());
  assert.deepEqual(settings.sorts.map((sort) => sort.value), ['newest', 'oldest', 'title', 'title-desc']);
  assert.equal(settings.perPage, 12);
  assert.deepEqual(settings.types, []);

  const custom = searchSettingsOf(
    panelData({
      filters: [{ _id: 'a', kind: 'search' }, { _id: 'b', kind: 'select_list', label: 'Topic', optionsType: 'simple_page', field: ' topic ' }],
      sortBy: [{ _id: 'c', value: 'title', label: 'A–Z' }, { _id: 'd', value: 'title' }, { _id: 'e', value: 'newest' }],
      perPage: 30,
    }),
  );
  assert.deepEqual(custom.filters, [{ kind: 'search', label: 'Keyword' }, { kind: 'select_list', label: 'Topic', optionsType: 'simple_page', field: 'topic' }]);
  assert.deepEqual(custom.sorts, [{ value: 'title', label: 'A–Z' }, { value: 'newest', label: 'Newest first' }]);
  assert.equal(custom.perPage, 30);
});

test('a query from the URL keeps only what the panel offers', () => {
  const settings: SearchSettings = {
    types: [],
    filters: [{ kind: 'alphabet', label: 'Letter' }, { kind: 'select_list', label: 'Topic' }],
    perPage: 6,
    sorts: [{ value: 'title', label: 'A–Z' }],
    hideSort: false,
  };
  const id = crypto.randomUUID();
  const query = parseSearchQuery(new URLSearchParams(`letter=m&type=landing_page&filter-2=${id}&sort=oldest&page=3&s=mars`), settings, ['landing_page']);
  // No Post Types filter: type is ignored. Unknown sort: the panel's first. ?s= always works (site search links).
  assert.deepEqual(query, { letter: 'M', picks: { 'filter-2': id }, text: 'mars', sort: 'title', page: 3 });
  assert.equal(parseSearchQuery(new URLSearchParams('letter=ab&page=-2'), settings, []).letter, undefined);
  assert.equal(searchQueryParams({ text: 'mars', sort: 'title', page: 1 }, settings).toString(), 's=mars');
});

let db: PGlite;
let editor: string;
let server: SupabaseClient;
let anon: SupabaseClient;
const ids: Record<string, string> = {};

before(async () => {
  db = await createTestDb();
  editor = await addUser(db, 'editor');
  server = fakeSupabase(db, 'service_role');
  anon = fakeSupabase(db, 'anon');

  const save = async (contentType: typeof landingPage | typeof simplePage, slug: string, title: string, boxes: StoredPage['boxes'], mode: 'publish' | 'draft' = 'publish') => {
    const page: StoredPage = { id: crypto.randomUUID(), contentType: contentType.name, slug, title, boxes, panels: [] };
    const result = await savePage(server, contentType, page, { mode, expectedVersion: 0, userId: editor });
    assert.equal(result.ok, true, JSON.stringify(result));
    ids[slug] = page.id;
  };
  await save(simplePage, 'mars', 'Mars', { content: { description: '<p>The red <em>planet</em>, home of Olympus Mons.</p>' } });
  await save(simplePage, 'europa', 'Europa', { content: { content: '<p>An icy moon of Jupiter with an ocean below.</p>' } });
  await save(landingPage, 'moons', 'Moons of the solar system', { hero: { copy: '<p>Café talks about the moon.</p>' } });
  await save(landingPage, 'secret', 'Secret moon base', { admin: { hidden: true } });
  await save(landingPage, 'draft-moon', 'Draft moon', {}, 'draft');
  await save(simplePage, '42', '42 facts', {});
  // A landing page that links to Mars (a Featured Post would): the select list finds it.
  await save(landingPage, 'tour', 'Red planet tour', { admin: { breadcrumbs: [{ _id: 'b1', text: 'Mars', url: `/${ids.mars}` }] } });
});

const settings = (overrides: Partial<SearchSettings> = {}): SearchSettings => ({
  types: [],
  filters: [{ kind: 'search', label: 'Keyword' }],
  perPage: 10,
  sorts: [{ value: 'title', label: 'A–Z' }],
  hideSort: false,
  ...overrides,
});

test('the resolver searches live, visible pages of the panel’s types, by words in any field', async () => {
  const live = createSearchResolver(anon, contentTypes, { draft: false });
  const titles = async (query = {}, overrides: Partial<SearchSettings> = {}) => (await live.run(settings(overrides), query)).cards.map((card) => card.title);

  assert.deepEqual(await titles(), ['42 facts', 'Europa', 'Mars', 'Moons of the solar system', 'Red planet tour']);
  // Every word must match, in the title or any field, ignoring case, tags and accents.
  assert.deepEqual(await titles({ text: 'MOON' }), ['Europa', 'Moons of the solar system']);
  assert.deepEqual(await titles({ text: 'red planet' }), ['Mars', 'Red planet tour']);
  assert.deepEqual(await titles({ text: 'cafe' }), ['Moons of the solar system']);
  // A–Z, and # for titles that don't start with a letter.
  assert.deepEqual(await titles({ letter: 'M' }), ['Mars', 'Moons of the solar system']);
  assert.deepEqual(await titles({ letter: '#' }), ['42 facts']);
  // Only the panel's types; a request can narrow to one of them, not widen.
  assert.deepEqual(await titles({}, { types: ['simple_page'] }), ['42 facts', 'Europa', 'Mars']);
  assert.deepEqual(await titles({ type: 'landing_page' }, { types: ['simple_page'] }), ['42 facts', 'Europa', 'Mars']);
  // Select list: pages that link to the picked one.
  assert.deepEqual(await titles({ picks: { 'filter-2': ids.mars } }, { filters: [{ kind: 'search', label: 'Keyword' }, { kind: 'select_list', label: 'Topic', optionsType: 'simple_page' }] }), ['Red planet tour']);

  const card = (await live.run(settings(), { text: 'olympus' })).cards[0]!;
  assert.deepEqual([card.title, card.typeLabel, card.url, card.description], ['Mars', 'Simple Page', '/mars', 'The red planet, home of Olympus Mons.']);
});

test('the resolver sorts and pages, and preview sees working copies', async () => {
  const live = createSearchResolver(anon, contentTypes, { draft: false });
  const page2 = await live.run(settings({ perPage: 2, sorts: [{ value: 'title-desc', label: 'Z–A' }] }), { page: 2 });
  assert.deepEqual([page2.total, page2.page, page2.pages, page2.cards.map((card) => card.title)], [5, 2, 3, ['Mars', 'Europa']]);
  // A page past the end shows the last.
  assert.equal((await live.run(settings({ perPage: 2 }), { page: 99 })).page, 3);

  const preview = createSearchResolver(server, contentTypes, { draft: true });
  assert.deepEqual((await preview.run(settings(), { text: 'moon' })).cards.map((card) => card.title), ['Draft moon', 'Europa', 'Moons of the solar system', 'Secret moon base']);

  const form = await live.describe(settings({ filters: [{ kind: 'post_types', label: 'Type' }, { kind: 'select_list', label: 'Topic', optionsType: 'simple_page' }] }));
  assert.deepEqual(form.filters.map((filter) => [filter.key, filter.options?.map((option) => option.label)]), [
    ['type', ['Landing Page', 'Simple Page']],
    ['filter-2', ['42 facts', 'Europa', 'Mars']],
  ]);
});

test('the route handler searches within the live panel’s settings only', async () => {
  const page: StoredPage = {
    id: crypto.randomUUID(),
    contentType: landingPage.name,
    slug: 'find',
    title: 'Find',
    boxes: {},
    panels: [{ id: 'search-1', type: 'cera/search', v: 1, data: { postTypes: ['simple_page'], filters: [{ _id: 'f', kind: 'search' }], perPage: 2 } }],
  };
  assert.equal((await savePage(server, landingPage, page, { mode: 'publish', expectedVersion: 0, userId: editor })).ok, true);
  const handler = createSearchHandler({ client: () => anon, contentTypes });
  const get = (query: string) => handler.GET(new Request(`http://site.test/api/cera/search?pageId=${page.id}&panelId=search-1&${query}`));

  const response = await get('sort=title&type=landing_page');
  assert.equal(response.status, 200);
  const { results } = (await response.json()) as { results: { total: number; pages: number; cards: Array<{ title: string }> } };
  assert.deepEqual([results.total, results.pages, results.cards.map((card) => card.title)], [3, 2, ['42 facts', 'Europa']]);

  assert.equal((await handler.GET(new Request(`http://site.test/api/cera/search?pageId=${page.id}&panelId=nope`))).status, 404);
  assert.equal((await handler.GET(new Request('http://site.test/api/cera/search?pageId=x&panelId=search-1'))).status, 400);
  // Once the page isn't live, its search is gone.
  await unpublishPage(server, page.id, editor);
  assert.equal((await get('')).status, 404);
});

test('the Search panel draws its filters and first results on the server', async () => {
  const raw: StoredPage = {
    id: crypto.randomUUID(),
    contentType: landingPage.name,
    slug: 'search-page',
    title: 'Search page',
    boxes: {},
    panels: [{ id: 'search-2', type: 'cera/search', v: 1, data: { title: 'Explore', postTypes: ['simple_page'], filters: [{ _id: 'f', kind: 'search', label: 'Find' }, { _id: 'g', kind: 'alphabet' }] } }],
  };
  const { page } = readPage(landingPage, raw);
  const loadContext = { pages: { byIds: async () => [] }, draft: false, search: createSearchResolver(anon, contentTypes, { draft: false }) };
  const errors: string[] = [];
  const html = renderToStaticMarkup(await Panels({ contentType: landingPage, page, loadContext, onError: (error) => errors.push(String(error)) }));
  assert.deepEqual(errors, []);
  assert.match(html, /<form class="cera-search__form" role="search" aria-label="Explore">/);
  assert.match(html, /<label[^>]*>Find<\/label>/);
  assert.match(html, /<legend>Starts with<\/legend>/);
  assert.equal(html.match(/class="post-card"/g)?.length, 3);
  assert.match(html, /3 results/);
});
