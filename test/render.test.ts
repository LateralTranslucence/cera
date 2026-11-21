import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { defineContentType, definePanel, f, readPage, type StoredPage } from '../src/index.ts';
import { Panels } from '../src/next/index.ts';
import { landingPage } from '../examples/next-site/cera/content-types/landing-page.ts';
import sample from '../examples/sample-page.json' with { type: 'json' };

const clone = (): StoredPage => structuredClone(sample) as unknown as StoredPage;
// Blocks loads its icons, so every page with blocks needs a load context.
const loadContext = { pages: { byIds: async () => [] }, draft: false };

test('renders panels in order with typed data and defaults', async () => {
  const { page } = readPage(landingPage, clone());
  const html = renderToStaticMarkup(await Panels({ contentType: landingPage, page, loadContext }));
  assert.match(html, /<section[^>]*class="panel panel--blocks panel--card"[^>]*data-index="0"/);
  assert.match(html, /--per-row:3/);
  assert.match(html, /<h3>Design<\/h3>/);
  assert.doesNotMatch(html, /Development/); // hidden block item
});

test('hidden panels are not rendered', async () => {
  const raw = clone();
  raw.panels[0]!.hidden = true;
  const { page } = readPage(landingPage, raw);
  const html = renderToStaticMarkup(await Panels({ contentType: landingPage, page, loadContext }));
  assert.doesNotMatch(html, /panel--blocks/);
});

test('a panel whose component fails to load is skipped; the rest render', async () => {
  const broken = definePanel({
    type: 'broken',
    label: 'Broken',
    fields: { title: f.text() },
    component: async () => {
      throw new Error('chunk failed');
    },
  });
  const ct = defineContentType({ name: 'landing_page', label: 'x', route: '/[slug]', boxes: landingPage.boxes, panels: [...landingPage.panels, broken] });
  const raw = clone();
  raw.panels.unshift({ id: 'b', type: 'broken', v: 1, data: {} });
  const { page } = readPage(ct, raw);

  const errors: string[] = [];
  const html = renderToStaticMarkup(await Panels({ contentType: ct, page, loadContext, onError: (_e, p) => errors.push(p.id) }));
  assert.deepEqual(errors, ['b']);
  assert.match(html, /panel--blocks/);
});
