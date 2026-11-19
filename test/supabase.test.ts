// End to end through the Supabase module: TypeScript validation → SQL → typed reads.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDraftPage, getPageForEditing, getPublishedPage, savePage, unpublishPage } from '../src/supabase/index.ts';
import type { StoredPage } from '../src/index.ts';
import { landingPage } from '../examples/content-types/landing-page.ts';
import sample from '../examples/sample-page.json' with { type: 'json' };
import { addUser, createTestDb, fakeSupabase } from './support/db.ts';

let db: PGlite;
let editor: string;
let viewer: string;
let server: SupabaseClient; // service role
let staff: SupabaseClient; // signed-in editor
let anon: SupabaseClient;

before(async () => {
  db = await createTestDb();
  editor = await addUser(db, 'editor');
  viewer = await addUser(db, 'viewer');
  server = fakeSupabase(db, 'service_role');
  staff = fakeSupabase(db, 'authenticated', { sub: editor, app_metadata: { cera_role: 'editor' } });
  anon = fakeSupabase(db, 'anon');
});

function newPage(slug: string): StoredPage {
  const p = structuredClone(sample) as unknown as StoredPage;
  p.id = crypto.randomUUID();
  p.slug = slug;
  return p;
}

test('publish, then read the live page as an anonymous visitor', async () => {
  const saved = await savePage(server, landingPage, newPage('about'), { mode: 'publish', expectedVersion: 0, userId: editor });
  assert.equal(saved.ok, true, JSON.stringify(saved));

  const live = await getPublishedPage(anon, landingPage, 'about');
  assert.ok(live);
  assert.equal(live.page.status, 'published');
  assert.deepEqual(live.issues, []);
  const [blocks, textMedia] = live.page.panels;
  if (blocks?.type !== 'blocks' || textMedia?.type !== 'text-media') throw new Error('unexpected panels');
  assert.equal(blocks.data.perRow, 3); // default filled on save
  assert.equal(textMedia.v, 2); // migrated on save
  assert.equal(textMedia.data.alignment, 'right');

  assert.equal(await getPublishedPage(anon, landingPage, 'missing'), null);
});

test('editing round trip: unknown panels and keys survive, the live page waits for publish', async () => {
  const draft = newPage('services');
  draft.panels.push({ id: 'p_new', type: 'carousel', v: 7, data: { slides: ['a'] } });
  draft.panels[0]!.data.legacy = 'keep me';
  const first = await savePage(server, landingPage, draft, { mode: 'publish', expectedVersion: 0, userId: editor });
  assert.equal(first.ok, true);

  // The admin loads it: everything is there, including what this code doesn't know.
  const editing = await getPageForEditing(staff, landingPage, draft.id);
  assert.ok(editing);
  assert.equal(editing.published, true);
  assert.equal(editing.page.panels.find((p) => p.id === 'p_new')?.type, 'carousel');
  assert.equal(editing.page.panels[0]!.data.legacy, 'keep me');

  // The editor changes the title and saves a draft.
  const changed = { ...editing.page, title: 'Services (new)' };
  const second = await savePage(server, landingPage, changed, { mode: 'draft', expectedVersion: editing.version, userId: editor });
  assert.equal(second.ok, true);

  const reloaded = await getPageForEditing(staff, landingPage, draft.id);
  assert.equal(reloaded!.page.title, 'Services (new)');
  assert.deepEqual(reloaded!.page.panels.find((p) => p.id === 'p_new')?.data, { slides: ['a'] });
  assert.equal(reloaded!.page.panels[0]!.data.legacy, 'keep me');

  // Visitors still see the published title; preview shows the draft.
  assert.equal((await getPublishedPage(anon, landingPage, 'services'))!.page.title, 'About');
  assert.equal((await getDraftPage(staff, landingPage, 'services'))!.page.title, 'Services (new)');
});

test('expected failures come back as reasons, not exceptions', async () => {
  const p = newPage('contact');
  const created = await savePage(server, landingPage, p, { mode: 'draft', expectedVersion: 0, userId: editor });
  assert.equal(created.ok, true);

  const stale = await savePage(server, landingPage, p, { mode: 'draft', expectedVersion: 5, userId: editor });
  assert.equal(stale.ok === false && stale.reason, 'conflict');

  const forbidden = await savePage(server, landingPage, newPage('viewer-page'), { mode: 'draft', expectedVersion: 0, userId: viewer });
  assert.equal(forbidden.ok === false && forbidden.reason, 'forbidden');

  const taken = await savePage(server, landingPage, newPage('contact'), { mode: 'draft', expectedVersion: 0, userId: editor });
  assert.equal(taken.ok === false && taken.reason, 'slug-taken');

  const bad = newPage('bad');
  bad.panels[0]!.data.style = 'grid';
  const invalid = await savePage(server, landingPage, bad, { mode: 'publish', expectedVersion: 0, userId: editor });
  assert.equal(invalid.ok === false && invalid.reason, 'invalid');
  assert.equal(await getDraftPage(staff, landingPage, 'bad'), null); // nothing was written
});

test('unpublish removes the live page', async () => {
  const p = newPage('temporary');
  await savePage(server, landingPage, p, { mode: 'publish', expectedVersion: 0, userId: editor });
  await unpublishPage(server, p.id, editor);
  assert.equal(await getPublishedPage(anon, landingPage, 'temporary'), null);
});
