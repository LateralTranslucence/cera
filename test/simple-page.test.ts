// Simple pages, and content types that share addresses (slugScope).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readPage, type StoredPage } from '../src/index.ts';
import { iconType } from '../src/icons/index.ts';
import { findDraftPage, findPublishedPage, savePage } from '../src/supabase/index.ts';
import { pageMetadata } from '../src/next/index.ts';
import { landingPage } from '../examples/next-site/cera/content-types/landing-page.ts';
import { simplePage } from '../examples/next-site/cera/content-types/simple-page.ts';
import type { AnyContentType } from '../src/content-type.ts';
import { addUser, createTestDb, fakeSupabase, queryAs } from './support/db.ts';

let db: PGlite;
let editor: string;
let server: SupabaseClient;
let anonymous: SupabaseClient;

before(async () => {
  db = await createTestDb();
  editor = await addUser(db, 'editor');
  server = fakeSupabase(db, 'service_role');
  anonymous = fakeSupabase(db, 'anon');
});

const page = (contentType: AnyContentType, slug: string, boxes: StoredPage['boxes'] = {}): StoredPage => ({
  id: crypto.randomUUID(),
  contentType: contentType.name,
  slug,
  title: slug,
  boxes,
  panels: [],
});

const save = (contentType: AnyContentType, storedPage: StoredPage, mode: 'draft' | 'publish' | 'schedule' = 'publish', expectedVersion = 0) =>
  savePage(server, contentType, storedPage, { mode, expectedVersion, userId: editor, ...(mode === 'schedule' && { publishAt: new Date(Date.now() + 3_600_000).toISOString() }) });

test('types in one slug scope can’t share an address; other types can', async () => {
  assert.equal((await save(landingPage, page(landingPage, 'shared'))).ok, true);

  // A simple page shares landing pages' addresses, even as a draft.
  const clash = await save(simplePage, page(simplePage, 'shared'), 'draft');
  assert.deepEqual([clash.ok, !clash.ok && clash.reason], [false, 'slug-taken']);

  // Icons have their own scope.
  const icon = page(iconType, 'shared', { icon: { svg: '<svg viewBox="0 0 1 1"><path d="M0 0h1v1z"/></svg>' } });
  assert.equal((await save(iconType, icon)).ok, true);

  // Moving a simple page onto a taken address is refused too.
  const other = page(simplePage, 'elsewhere');
  assert.equal((await save(simplePage, other, 'draft')).ok, true);
  const moved = await save(simplePage, { ...other, slug: 'shared' }, 'draft', 1);
  assert.deepEqual([moved.ok, !moved.ok && moved.reason], [false, 'slug-taken']);

  const rows = await queryAs(db, 'service_role', `select content_type, slug_scope from public.cera_pages where slug = 'shared' order by content_type`);
  assert.deepEqual(rows, [
    { content_type: 'cera_icon', slug_scope: 'cera_icon' },
    { content_type: 'landing_page', slug_scope: 'landing_page' },
  ]);
});

test('findPublishedPage and findDraftPage find a page at a shared route, whichever type it is', async () => {
  const simple = page(simplePage, 'plain', { content: { description: '<p>A <strong>short</strong> page.</p>', content: '<p>Body</p>' } });
  assert.equal((await save(simplePage, simple)).ok, true);
  assert.equal((await save(landingPage, page(landingPage, 'fancy'))).ok, true);
  assert.equal((await save(simplePage, page(simplePage, 'unpublished'), 'draft')).ok, true);

  const found = await findPublishedPage(anonymous, [landingPage, simplePage], 'plain');
  assert.equal(found?.type, 'simple_page');
  assert.equal(found?.page.boxes.content.description, '<p>A <strong>short</strong> page.</p>');
  assert.equal((await findPublishedPage(anonymous, [landingPage, simplePage], 'fancy'))?.type, 'landing_page');
  assert.equal(await findPublishedPage(anonymous, [landingPage, simplePage], 'unpublished'), null);
  // Only the types asked for.
  assert.equal(await findPublishedPage(anonymous, [landingPage], 'plain'), null);

  const draft = await findDraftPage(server, [landingPage, simplePage], 'unpublished');
  assert.deepEqual([draft?.type, draft?.page.status], ['simple_page', 'draft']);
});

test('a simple page’s search details come from its description and image', () => {
  const image = { id: 'm1', path: '2026/11/a.jpg', kind: 'image' as const, alt: 'A', width: 800, height: 600 };
  const { page: loadedPage } = readPage(simplePage, page(simplePage, 'meta', { content: { image, description: `<p>${'Words and more. '.repeat(20)}</p>` } }));
  const meta = pageMetadata(simplePage, loadedPage, { mediaUrl: (media) => `https://cdn.example/${media.path}` });
  assert.equal(meta.title, 'meta');
  assert.equal(String(meta.description).length, 160);
  assert.doesNotMatch(String(meta.description), /<p>/);
  assert.deepEqual((meta.openGraph?.images as Array<{ url: string }>)?.[0]?.url, 'https://cdn.example/2026/11/a.jpg');
});
