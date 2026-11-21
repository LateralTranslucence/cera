// The Supabase migrations, exercised in PGlite with the roles Supabase uses.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import { addUser, createTestDb, queryAs } from './support/db.ts';

let db: PGlite;
let editor: string;
let viewer: string;
let nobody: string;

before(async () => {
  db = await createTestDb();
  editor = await addUser(db, 'editor');
  viewer = await addUser(db, 'viewer');
  nobody = await addUser(db, null);
});

const page = (id: string, slug: string, title: string) => ({
  id,
  contentType: 'landing_page',
  slug,
  title,
  boxes: { hero: { title } },
  panels: [{ id: 'p1', type: 'cera/blocks', v: 1, hidden: false, data: { title: 'x' } }],
});

async function save(storedPage: object, expected: number, publish: boolean, user = editor) {
  const rows = await queryAs<{ r: { id: string; version: number; revisionId: string } }>(
    db,
    'service_role',
    'select public.cera_save_page($1, $2, $3, $4) as r',
    [JSON.stringify(storedPage), expected, publish, user],
  );
  return rows[0]!.r;
}

const publicLookup = (slug: string) =>
  queryAs<{ title: string }>(db, 'anon', `select title from public.cera_page_revisions where content_type = 'landing_page' and slug = $1`, [slug]);

test('a draft save creates the page and a revision, but nothing is public', async () => {
  const id = crypto.randomUUID();
  const result = await save(page(id, 'draft-only', 'Draft'), 0, false);
  assert.equal(result.version, 1);
  assert.deepEqual(await publicLookup('draft-only'), []);
  const revisions = await queryAs(db, 'service_role', 'select kind, is_published from public.cera_page_revisions where page_id = $1', [id]);
  assert.deepEqual(revisions, [{ kind: 'draft', is_published: false }]);
});

test('publishing makes a revision live; later drafts do not change the live page', async () => {
  const id = crypto.randomUUID();
  await save(page(id, 'about', 'About v1'), 0, true);
  assert.deepEqual(await publicLookup('about'), [{ title: 'About v1' }]);

  const result = await save(page(id, 'about', 'About v2 (draft)'), 1, false);
  assert.equal(result.version, 2);
  assert.deepEqual(await publicLookup('about'), [{ title: 'About v1' }]);

  await save(page(id, 'about-us', 'About v3'), 2, true);
  assert.deepEqual(await publicLookup('about'), []);
  assert.deepEqual(await publicLookup('about-us'), [{ title: 'About v3' }]);
});

test('a stale version is rejected with CE409', async () => {
  const id = crypto.randomUUID();
  await save(page(id, 'race', 'A'), 0, false);
  await save(page(id, 'race', 'B'), 1, false);
  await assert.rejects(save(page(id, 'race', 'C'), 1, false), (error: { code?: string }) => error.code === 'CE409');
});

test('updating a page that does not exist is CE404', async () => {
  await assert.rejects(save(page(crypto.randomUUID(), 'ghost', 'G'), 3, false), (error: { code?: string }) => error.code === 'CE404');
});

test('only admins and editors can save', async () => {
  for (const user of [viewer, nobody, crypto.randomUUID()]) {
    await assert.rejects(save(page(crypto.randomUUID(), 'nope', 'N'), 0, false, user), (error: { code?: string }) => error.code === '42501');
  }
});

test('browser roles cannot write tables or call the save function', async () => {
  const claims = { app_metadata: { cera_role: 'admin' } };
  await assert.rejects(
    queryAs(db, 'authenticated', `insert into public.cera_pages (content_type, slug) values ('landing_page', 'x')`, [], claims),
    /permission denied/,
  );
  await assert.rejects(
    queryAs(db, 'authenticated', 'select public.cera_save_page($1, 0, true, $2)', [JSON.stringify(page(crypto.randomUUID(), 'x', 'X')), editor], claims),
    /permission denied/,
  );
  await assert.rejects(queryAs(db, 'anon', 'update public.cera_page_revisions set is_published = true'), /permission denied/);
});

test('staff can read working copies; anon and role-less users cannot', async () => {
  const id = crypto.randomUUID();
  await save(page(id, 'staff-only', 'Staff'), 0, false);
  const sql = 'select title from public.cera_pages where id = $1';
  assert.deepEqual(await queryAs(db, 'authenticated', sql, [id], { app_metadata: { cera_role: 'viewer' } }), [{ title: 'Staff' }]);
  assert.deepEqual(await queryAs(db, 'authenticated', sql, [id], { app_metadata: {} }), []);
  assert.deepEqual(await queryAs(db, 'anon', sql, [id]), []);
});

test('unpublishing takes a page off the live site', async () => {
  const id = crypto.randomUUID();
  await save(page(id, 'gone-soon', 'Here'), 0, true);
  await queryAs(db, 'service_role', 'select public.cera_unpublish_page($1, $2)', [id, editor]);
  assert.deepEqual(await publicLookup('gone-soon'), []);
});

test('slugs are validated by the database too', async () => {
  await assert.rejects(save(page(crypto.randomUUID(), 'Bad Slug', 'B'), 0, false), /cera_pages_slug_format/);
});

test('the media bucket exists and is public', async () => {
  const rows = await queryAs(db, 'service_role', `select public from storage.buckets where id = 'cera-media'`);
  assert.deepEqual(rows, [{ public: true }]);
});
