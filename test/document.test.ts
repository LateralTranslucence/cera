import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineContentType, definePanel, f, preparePageForSave, readPage, PageShapeError, type StoredPage } from '../src/index.ts';
import { landingPage } from '../examples/content-types/landing-page.ts';
import sample from '../examples/sample-page.json' with { type: 'json' };

const clone = (): StoredPage => structuredClone(sample) as unknown as StoredPage;

/* ---------------------------- save never loses data ---------------------------- */

test('save keeps unknown keys in panel data, repeater items and boxes', async () => {
  const raw = clone();
  raw.panels[0]!.data.legacyLayout = 'masonry';
  (raw.panels[0]!.data.blocks as Array<Record<string, unknown>>)[0]!.legacyBadge = 'new';
  raw.boxes.hero!.legacySubtitle = 'kept';
  raw.boxes.retiredBox = { anything: 1 };

  const r = await preparePageForSave(landingPage, raw, { mode: 'publish' });
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  const blocks = r.page!.panels[0]!.data;
  assert.equal(blocks.legacyLayout, 'masonry');
  assert.equal((blocks.blocks as Array<Record<string, unknown>>)[0]!.legacyBadge, 'new');
  assert.equal(r.page!.boxes.hero!.legacySubtitle, 'kept');
  assert.deepEqual(r.page!.boxes.retiredBox, { anything: 1 });
  // …and defaults are still filled in.
  assert.equal(blocks.perRow, 3);
});

test('save keeps panels of unknown types, in place, with a warning', async () => {
  const raw = clone();
  const carousel = { id: 'p_car', type: 'carousel', v: 4, hidden: false, data: { slides: [1, 2] }, extra: true };
  raw.panels.splice(1, 0, carousel);

  const r = await preparePageForSave(landingPage, raw, { mode: 'publish' });
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.deepEqual(r.page!.panels[1], carousel);
  assert.deepEqual(r.issues.map((i) => i.code), ['unknown-panel']);
});

test('save upgrades old panels to the current version', async () => {
  const r = await preparePageForSave(landingPage, clone(), { mode: 'draft' });
  const tm = r.page!.panels[1]!;
  assert.equal(tm.v, 2);
  assert.equal(tm.data.alignment, 'right');
});

/* ---------------------------- draft vs publish ---------------------------- */

test('drafts save with warnings and keep the raw value; publishing refuses', async () => {
  const raw = clone();
  raw.title = '';
  raw.panels[0]!.data.style = 'grid'; // not an option

  const draft = await preparePageForSave(landingPage, raw, { mode: 'draft' });
  assert.equal(draft.ok, true);
  assert.equal(draft.page!.panels[0]!.data.style, 'grid');
  assert.deepEqual(
    draft.issues.map((i) => [i.severity, i.path.join('.')]),
    [
      ['warning', 'title'],
      ['warning', 'panels.0.data.style'],
    ],
  );

  const publish = await preparePageForSave(landingPage, raw, { mode: 'publish' });
  assert.equal(publish.ok, false);
  assert.deepEqual(publish.issues.map((i) => i.severity), ['error', 'error']);
});

test('bad slugs and duplicate panel ids are errors even for drafts', async () => {
  const raw = clone();
  raw.slug = 'About Us';
  raw.panels[1]!.id = raw.panels[0]!.id;
  const r = await preparePageForSave(landingPage, raw, { mode: 'draft' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.issues.filter((i) => i.severity === 'error').map((i) => i.code).sort(), ['duplicate-panel-id', 'invalid-page']);
});

test('a malformed envelope is rejected without throwing', async () => {
  const r = await preparePageForSave(landingPage, { id: 'x', contentType: 'other', slug: 'a' }, { mode: 'draft' });
  assert.equal(r.ok, false);
  assert.equal(r.page, undefined);
});

test('beforeSave sees known panels only; unknown panels are put back in place', async () => {
  const raw = clone();
  raw.slug = 'home';
  raw.panels.splice(1, 0, { id: 'p_car', type: 'carousel', v: 1, data: {} });

  const r = await preparePageForSave(landingPage, raw, { mode: 'publish' });
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.equal(r.page!.title, 'Home');
  assert.deepEqual(r.page!.panels.map((p) => p.type), ['blocks', 'carousel', 'text-media']);
});

/* ---------------------------- reads are forgiving ---------------------------- */

test('read: an invalid field falls back to its default and the panel still renders', () => {
  const raw = clone();
  raw.panels[0]!.data.style = 'grid';
  const { page, issues } = readPage(landingPage, raw);
  const blocks = page.panels[0];
  if (blocks?.type !== 'blocks') throw new Error('expected blocks');
  assert.equal(blocks.data.style, 'card');
  assert.deepEqual(issues.map((i) => [i.code, i.path.join('.')]), [['invalid-field', 'panels.0.data.style']]);
});

test('read: unknown, too-new and unrepairable panels are skipped; the rest render', () => {
  const quote = definePanel({
    type: 'quote',
    label: 'Quote',
    fields: { text: f.text({ required: true }) },
    component: async () => ({ default: () => null }),
  });
  const ct = defineContentType({ name: 'landing_page', label: 'x', route: '/[slug]', boxes: landingPage.boxes, panels: [...landingPage.panels, quote] });

  const raw = clone();
  raw.panels.push(
    { id: 'u', type: 'carousel', v: 1, data: {} },
    { id: 'n', type: 'text-media', v: 3, data: {} }, // newer than the definition (v2)
    { id: 'q', type: 'quote', v: 1, data: { text: 42 } }, // required field, wrong type, no default
  );
  const { page, issues } = readPage(ct, raw);
  assert.deepEqual(page.panels.map((p) => p.id), ['p_8f2a', 'p_19cc']);
  assert.deepEqual(
    issues.map((i) => [i.code, i.panelId]),
    [
      ['unknown-panel', 'u'],
      ['migration-failed', 'n'],
      ['invalid-field', 'q'],
      ['invalid-panel', 'q'],
    ],
  );
});

test('read: a broken box field falls back without losing the rest of the box', () => {
  const raw = clone();
  raw.boxes.admin = { noindex: 'yes', css: 'dark' };
  const { page, issues } = readPage(landingPage, raw, { status: 'published' });
  assert.equal(page.boxes.admin.noindex, false);
  assert.equal(page.boxes.admin.css, 'dark');
  assert.equal(page.status, 'published');
  assert.equal(issues.length, 1);
});

test('read: a row that is not a page of this type throws PageShapeError', () => {
  assert.throws(() => readPage(landingPage, { id: 'x', contentType: 'simple_page', slug: 'a' }), PageShapeError);
});
