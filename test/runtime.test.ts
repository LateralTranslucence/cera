import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definePanel, f, upgradePagePanels, type StoredPanel } from '../src/index.ts';
import { landingPage } from '../examples/content-types/landing-page.ts';
import sample from '../examples/sample-page.json' with { type: 'json' };

function load(raw: typeof sample) {
  const panels = upgradePagePanels(landingPage.panels, raw.panels as StoredPanel[]);
  return landingPage.pageSchema.parse({ ...raw, panels });
}

test('sample page validates and defaults are filled in', () => {
  const page = load(sample);
  const [blocks, textMedia] = page.panels;
  assert.equal(blocks?.type, 'blocks');
  if (blocks?.type !== 'blocks') throw new Error('unreachable');
  assert.equal(blocks.data.perRow, 3);
  assert.equal(blocks.data.style, 'card');
  assert.equal(blocks.hidden, false);
  assert.equal(blocks.data.blocks[0]?.cta?.target, '_self');
  assert.equal(blocks.data.blocks[1]?.hidden, true);
  assert.deepEqual(blocks.data.ctas, []);
  assert.equal(page.boxes.admin.schemaType, 'WebPage');
  assert.equal(page.boxes.admin.noindex, false);
  assert.equal(textMedia?.type, 'text-media');
});

test('migrations upgrade old panel data before validation', () => {
  const page = load(sample);
  const tm = page.panels[1];
  if (tm?.type !== 'text-media') throw new Error('expected text-media');
  assert.equal(tm.v, 2);
  assert.equal(tm.data.alignment, 'right');
  assert.equal('mediaAlignment' in tm.data, false);
});

test('seo + jsonLd + hooks read typed page data', async () => {
  const page = load(sample);
  assert.equal(landingPage.seo?.title?.(page), 'About');
  assert.equal(landingPage.seo?.description?.(page), 'Who we are.');
  assert.equal(landingPage.jsonLd?.(page)['@type'], 'WebPage');
  const home = await landingPage.hooks!.beforeSave!({ ...page, slug: 'home' });
  assert.equal(home.title, 'Home');
});

test('invalid data is rejected with a useful path', () => {
  const bad = structuredClone(sample);
  (bad.panels[0]!.data as Record<string, unknown>).style = 'grid';
  const result = landingPage.pageSchema.safeParse({ ...bad, panels: upgradePagePanels(landingPage.panels, bad.panels as StoredPanel[]) });
  assert.equal(result.success, false);
  assert.deepEqual(result.error?.issues[0]?.path, ['panels', 0, 'data', 'style']);
});

test('unknown panel types are dropped, not fatal', () => {
  const dropped: string[] = [];
  const out = upgradePagePanels(landingPage.panels, [{ id: 'x', type: 'carousel', v: 1, data: {} }], (p) => dropped.push(p.type));
  assert.deepEqual(out, []);
  assert.deepEqual(dropped, ['carousel']);
});

test('definePanel guards: kebab-case type, migrations required for each version', () => {
  const component = async () => ({ default: () => null });
  assert.throws(() => definePanel({ type: 'TextMedia', label: 'x', fields: {}, component }), /kebab-case/);
  assert.throws(() => definePanel({ type: 'x', label: 'x', version: 2, fields: { a: f.text() }, component }), /no migration from v1/);
});

test('repeater limit is enforced (theme: decision-tree Cards limit 2)', () => {
  const cards = f.repeater({ limit: 2, fields: { title: f.text() } });
  assert.equal(cards.schema.safeParse([{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }]).success, false);
  assert.equal(cards.schema.safeParse([{ _id: 'a' }]).success, true);
});
