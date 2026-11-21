// Icons: cleaning uploaded SVGs, the bundled Lucide set, Font Awesome packs,
// combining sets, a site's own icons from the database, and Blocks drawing them.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { preparePageForSave, readPage, type StoredPage } from '../src/index.ts';
import { cleanSvg } from '../src/svg.ts';
import { createIconLibrary, fontAwesomeIcons, iconType, lucideIcons, parseIconValue, type FontAwesomeIcon, type IconSet } from '../src/icons/index.ts';
import { savePage, supabaseIcons } from '../src/supabase/index.ts';
import { Panels } from '../src/next/index.ts';
import { landingPage } from '../examples/next-site/cera/content-types/landing-page.ts';
import sample from '../examples/sample-page.json' with { type: 'json' };
import { addUser, createTestDb, fakeSupabase } from './support/db.ts';

const ROCKET = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path d="M1 1h14v14H1z" fill="#000"/></svg>';

test('cleanSvg keeps drawing only, points color at the text, and sizes by viewBox', () => {
  const r = cleanSvg(
    `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" onload="alert(1)">` +
      `<script>alert(1)</script><foreignObject><div>x</div></foreignObject><image href="https://evil.example/x.png"/>` +
      `<a href="javascript:alert(1)"><circle r="2" fill="url(https://evil.example/#g)"/></a>` +
      `<defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs>` +
      `<rect width="4" height="4" fill="url(#g)" style="stroke: black"/><path d="M0 0h1" stroke="black"/></svg>`,
  );
  assert.ok(!('error' in r));
  assert.equal(r.removed, true);
  assert.doesNotMatch(r.svg, /script|onload|foreignObject|image|href|evil|javascript/i);
  assert.match(r.svg, /^<svg[^>]* viewBox="0 0 24 24"[^>]* fill="currentColor">/);
  assert.doesNotMatch(r.svg, /<svg[^>]*\swidth=/);
  assert.match(r.svg, /<circle r="2"><\/circle>/); // the outside url() fill went, the circle stayed
  assert.match(r.svg, /fill="url\(#g\)"/); // gradients inside the file stay
  assert.match(r.svg, /style="stroke:currentColor"/);
  assert.match(r.svg, /stroke="currentColor"/);

  // Already clean: nothing reported, and cleaning again changes nothing.
  const lucide = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14"></path></svg>';
  assert.deepEqual(cleanSvg(lucide), { svg: lucide, removed: false });

  assert.equal((cleanSvg('<div>hi</div>') as { error?: string }).error, 'That isn’t an SVG file.');
  assert.match((cleanSvg('<svg><script>x</script></svg>') as { error?: string }).error!, /nothing left to draw/);
  assert.match((cleanSvg(`<svg>${'<path d="M0 0"/>'.repeat(10_000)}</svg>`) as { error?: string }).error!, /too large/);
});

function icon(title: string, svg: string | undefined, extra: Record<string, unknown> = {}): StoredPage {
  const slug = title.toLowerCase().replace(/\s+/g, '-');
  return { id: crypto.randomUUID(), contentType: iconType.name, slug, title, boxes: { icon: { svg, ...extra } }, panels: [] };
}

test('saving an icon cleans its SVG, warns about what went, and refuses a file that isn’t one', async () => {
  const saved = await preparePageForSave(iconType, icon('Rocket', '<svg viewBox="0 0 1 1"><script>x</script><path d="M0 0"/></svg>'), { mode: 'publish' });
  assert.equal(saved.ok, true);
  assert.doesNotMatch(JSON.stringify(saved.page), /script/);
  assert.deepEqual(saved.issues.map((i) => [i.code, i.severity, i.path.join('.')]), [['svg-cleaned', 'warning', 'boxes.icon.svg']]);

  const bad = await preparePageForSave(iconType, icon('Bad', '<p>not an svg</p>'), { mode: 'draft' });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.issues.map((i) => i.code), ['svg-invalid']);

  // The file is required to publish.
  const empty = await preparePageForSave(iconType, icon('Empty', undefined), { mode: 'publish' });
  assert.equal(empty.ok, false);
});

test('Lucide: search by name and keywords, best match first; get leaves unknown names out', async () => {
  const [first] = await lucideIcons.search('arrow right', 5);
  assert.equal(first?.value, 'lucide:arrow-right');
  assert.equal(first?.label, 'Arrow right');
  assert.match(first!.svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"[^>]*><path d="M5 12h14"\/>/);

  // "boost" is only a keyword (tag) of rocket.
  assert.ok((await lucideIcons.search('boost', 20)).some((g) => g.value === 'lucide:rocket'));
  // Keywords match at the start of a word: "rocket" doesn't find cogs through their keyword "sprocket".
  assert.ok(!(await lucideIcons.search('rocket', 50)).some((g) => g.value === 'lucide:cog'));
  assert.equal((await lucideIcons.search('', 10)).length, 10);
  assert.deepEqual((await lucideIcons.search('zzzz-no-such-icon', 10)), []);

  const got = await lucideIcons.get(['house', 'not-an-icon', '__proto__']);
  assert.deepEqual(got.map((g) => g.value), ['lucide:house']);
});

test('Font Awesome packs: one icon per name, aliases searchable, duotone drawn as two paths', () => {
  const house: FontAwesomeIcon = { prefix: 'fas', iconName: 'house', icon: [576, 512, [63498, 'home', 'home-alt'], 'f015', 'M0 0h576v512H0z'] };
  const duo: FontAwesomeIcon = { prefix: 'fad', iconName: 'star', icon: [512, 512, [], 'f005', ['M1 1', 'M2 2']] };
  const set = fontAwesomeIcons({ name: 'fa-solid', label: 'Font Awesome Solid', icons: { faHouse: house, faHome: house, faStar: duo } });

  assert.deepEqual(
    (set.search('', 10) as Array<{ value: string }>).map((g) => g.value),
    ['fa-solid:house', 'fa-solid:star'],
  );
  assert.deepEqual((set.search('home', 10) as Array<{ value: string }>).map((g) => g.value), ['fa-solid:house']);
  const [h] = set.get(['house']) as Array<{ svg: string }>;
  assert.equal(h!.svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512" fill="currentColor"><path d="M0 0h576v512H0z"/></svg>');
  const [s] = set.get(['star']) as Array<{ svg: string }>;
  assert.match(s!.svg, /<path d="M1 1" opacity="0.4"\/><path d="M2 2"\/>/);
});

test('the library resolves values across sets and searches each set in order', async () => {
  const mine: IconSet = {
    name: 'custom',
    label: 'Yours',
    search: () => [{ value: 'custom:1', label: 'One', svg: '<svg/>' }],
    get: (names) => names.filter((n) => n === '1').map(() => ({ value: 'custom:1', label: 'One', svg: '<svg/>' })),
  };
  const library = createIconLibrary([mine, lucideIcons]);
  assert.deepEqual(library.sets, [{ name: 'custom', label: 'Yours' }, { name: 'lucide', label: 'Lucide' }]);

  const found = await library.byValues(['lucide:rocket', 'custom:1', 'custom:2', 'nope:x', 'no-colon', 'lucide:rocket']);
  assert.deepEqual([...found.keys()].sort(), ['custom:1', 'lucide:rocket']);

  const results = await library.search('arrow', { limit: 3 });
  assert.equal(results[0]?.value, 'custom:1');
  assert.equal(results.filter((g) => g.value.startsWith('lucide:')).length, 3);
  assert.deepEqual((await library.search('rocket', { set: 'custom' })).map((g) => g.value), ['custom:1']);

  assert.deepEqual(parseIconValue('fa-solid:house'), { set: 'fa-solid', name: 'house' });
  assert.equal(parseIconValue('Bad Set:x'), null);
  assert.throws(() => createIconLibrary([lucideIcons, lucideIcons]), /two icon sets are named "lucide"/);
});

let db: PGlite;
let editor: string;
let server: SupabaseClient;

before(async () => {
  db = await createTestDb();
  editor = await addUser(db, 'editor');
  server = fakeSupabase(db, 'service_role');
});

async function save(page: StoredPage, mode: 'draft' | 'publish') {
  const r = await savePage(server, iconType, page, { mode, expectedVersion: 0, userId: editor });
  assert.equal(r.ok, true, JSON.stringify(r));
  return page.id;
}

test('a site’s own icons: live ones for visitors, working copies (marked) for the admin, hidden ones not offered', async () => {
  const rocket = await save(icon('Rocket', ROCKET, { keywords: 'launch, space' }), 'publish');
  const draft = await save(icon('Comet', ROCKET), 'draft');
  const hidden = await save(icon('Old logo', ROCKET, { hidden: true }), 'publish');

  const live = supabaseIcons(fakeSupabase(db, 'anon'), { draft: false });
  assert.deepEqual((await live.search('', 10)).map((g) => g.label), ['Rocket']);
  assert.deepEqual((await live.search('space', 10)).map((g) => g.value), [`custom:${rocket}`]);
  // The SVG was cleaned on save: black became currentColor.
  const [r] = await live.get([rocket]);
  assert.match(r!.svg, /fill="currentColor"/);
  assert.doesNotMatch(r!.svg, /#000/);
  // Hidden icons still draw where they're used; drafts don't, on the live site.
  assert.deepEqual((await live.get([hidden, draft, 'not-a-uuid'])).map((g) => g.label), ['Old logo']);

  const admin = supabaseIcons(server, { draft: true });
  assert.deepEqual((await admin.search('', 10)).map((g) => [g.label, g.note]), [['Comet', 'Not published'], ['Rocket', undefined]]);
});

test('Blocks draws each block’s icon through loadContext.icons', async () => {
  const raw = structuredClone(sample) as unknown as StoredPage;
  const blocks = raw.panels.find((p) => p.type === 'cera/blocks')!;
  (blocks.data as { blocks: Array<Record<string, unknown>> }).blocks[0]!.icon = 'lucide:rocket';
  (blocks.data as { blocks: Array<Record<string, unknown>> }).blocks[1]!.icon = 'lucide:house'; // a hidden block: not drawn
  const { page } = readPage(landingPage, raw);

  const loadContext = { pages: { byIds: async () => [] }, draft: false, icons: createIconLibrary([lucideIcons]) };
  const html = renderToStaticMarkup(await Panels({ contentType: landingPage, page, loadContext }));
  assert.equal(html.match(/class="cera-icon-glyph block__icon"/g)?.length, 1);
  assert.match(html, /<span class="cera-icon-glyph block__icon" aria-hidden="true"><svg [^>]*viewBox="0 0 24 24"/);
});
