// Deleting pages, the pages that link to one, a page's history, and restoring
// an old version.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deletePage,
  getPageForEditing,
  getPublishedPage,
  listPages,
  pageHistory,
  getRevisionPage,
  pageLinks,
  pruneRevisions,
  restoreRevision,
  savePage,
  unpublishPage,
} from '../src/supabase/index.ts';
import type { StoredPage } from '../src/index.ts';
import { landingPage } from '../examples/next-site/cera/content-types/landing-page.ts';
import sample from '../examples/sample-page.json' with { type: 'json' };
import { addUser, createTestDb, fakeSupabase, queryAs } from './support/db.ts';

let db: PGlite;
let editor: string;
let viewer: string;
let server: SupabaseClient;
let staff: SupabaseClient;
let anonymous: SupabaseClient;

before(async () => {
  db = await createTestDb();
  editor = await addUser(db, 'editor');
  viewer = await addUser(db, 'viewer');
  await db.query(`update auth.users set email = 'ed@example.test' where id = $1`, [editor]);
  server = fakeSupabase(db, 'service_role');
  staff = fakeSupabase(db, 'authenticated', { sub: viewer, app_metadata: { cera_role: 'viewer' } });
  anonymous = fakeSupabase(db, 'anon');
});

function newPage(slug: string, title = slug): StoredPage {
  const page = structuredClone(sample) as unknown as StoredPage;
  page.id = crypto.randomUUID();
  page.slug = slug;
  page.title = title;
  return page;
}

async function save(page: StoredPage, mode: 'draft' | 'publish', expectedVersion: number) {
  const result = await savePage(server, landingPage, page, { mode, expectedVersion, userId: editor });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('unreachable');
  return result;
}

/** A Featured Post panel pointing at `target`. */
function featuring(page: StoredPage, target: string): StoredPage {
  return {
    ...page,
    panels: [...page.panels, { id: crypto.randomUUID(), type: 'cera/featured-post', v: 1, data: { post: [target] } } as StoredPage['panels'][number]],
  };
}

test('only a page that is not live can be deleted, at the version the editor saw', async () => {
  const page = newPage('del-a');
  await save(page, 'publish', 0);

  let result = await deletePage(server, page.id, { expectedVersion: 1, userId: editor });
  assert.deepEqual([result.ok, !result.ok && result.reason], [false, 'live']);

  await unpublishPage(server, page.id, editor);
  await save({ ...page, title: 'Changed' }, 'draft', 1);
  result = await deletePage(server, page.id, { expectedVersion: 1, userId: editor });
  assert.deepEqual([result.ok, !result.ok && result.reason], [false, 'conflict']);

  result = await deletePage(server, page.id, { expectedVersion: 2, userId: viewer });
  assert.deepEqual([result.ok, !result.ok && result.reason], [false, 'forbidden']);

  result = await deletePage(server, page.id, { expectedVersion: 2, userId: editor });
  assert.deepEqual(result, { ok: true, id: page.id, contentType: landingPage.name, slug: 'del-a' });
  assert.equal(await getPageForEditing(server, landingPage, page.id), null);
  assert.equal((await listPages(server)).some((listedPage) => listedPage.id === page.id), false);
  // Its history went with it.
  const left = await queryAs(db, 'service_role', `select count(*)::int as n from public.cera_page_revisions where page_id = $1`, [page.id]);
  assert.equal(left[0]?.n, 0);

  result = await deletePage(server, page.id, { expectedVersion: 2, userId: editor });
  assert.deepEqual([result.ok, !result.ok && result.reason], [false, 'not-found']);
});

test('deleting a page frees its address and takes its pending schedule with it', async () => {
  const page = newPage('del-sched');
  await save(page, 'draft', 0);
  const scheduled = await savePage(server, landingPage, page, { mode: 'schedule', expectedVersion: 1, userId: editor, publishAt: new Date(Date.now() + 3_600_000).toISOString() });
  assert.equal(scheduled.ok, true);
  assert.equal((await deletePage(server, page.id, { expectedVersion: 2, userId: editor })).ok, true);
  const pending = await queryAs(db, 'service_role', `select count(*)::int as n from public.cera_page_revisions where schedule_status = 'pending' and page_id = $1`, [page.id]);
  assert.equal(pending[0]?.n, 0);
  // The address can be used again.
  await save(newPage('del-sched'), 'draft', 0);
});

test('pageLinks lists the other pages that link to a page, draft and live', async () => {
  const target = newPage('linked-target');
  await save(target, 'publish', 0);
  const liveLinker = newPage('linker-live', 'Live linker');
  await save(featuring(liveLinker, target.id), 'publish', 0);
  const draftLinker = newPage('linker-draft', 'Draft linker');
  await save(draftLinker, 'publish', 0);
  await save(featuring(draftLinker, target.id), 'draft', 1);
  await save(newPage('unrelated'), 'draft', 0);

  const links = await pageLinks(staff, target.id);
  assert.deepEqual(
    links.map((link) => [link.title, link.draft, link.live]),
    [
      ['Draft linker', true, false],
      ['Live linker', true, true],
    ],
  );
  assert.deepEqual(await pageLinks(staff, liveLinker.id), []);
  // The public can't ask.
  await assert.rejects(pageLinks(anonymous, target.id), { code: '42501' });
});

test('pageHistory lists versions newest first, with who saved them and what went live', async () => {
  const page = newPage('hist-a', 'One');
  await save(page, 'draft', 0);
  await save({ ...page, title: 'Two' }, 'publish', 1);
  await save({ ...page, title: 'Three' }, 'draft', 2);

  const history = await pageHistory(staff, page.id);
  assert.deepEqual(
    history.map((revision) => [revision.version, revision.kind, revision.title, revision.live]),
    [
      [3, 'draft', 'Three', false],
      [2, 'publish', 'Two', true],
      [1, 'draft', 'One', false],
    ],
  );
  assert.equal(history[0]!.createdBy, 'ed@example.test');

  // Paging: older than version 3, two at a time.
  assert.deepEqual((await pageHistory(staff, page.id, { before: 3, limit: 1 })).map((revision) => revision.version), [2]);
  await assert.rejects(pageHistory(anonymous, page.id), { code: '42501' });
});

test('restoring a version saves its content as a new draft and leaves the live page alone', async () => {
  const page = newPage('restore-a', 'Original');
  await save(page, 'publish', 0);
  await save({ ...page, title: 'Rewritten', panels: [] }, 'draft', 1);

  const result = await restoreRevision(server, landingPage, page.id, 1, { expectedVersion: 2, userId: editor });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) return;
  assert.equal(result.version, 3);
  assert.equal(result.page.title, 'Original');
  assert.equal(result.page.panels.length, page.panels.length);

  const editing = await getPageForEditing(server, landingPage, page.id);
  assert.deepEqual([editing?.version, editing?.page.title, editing?.unpublishedChanges], [3, 'Original', false]);
  assert.equal((await getPublishedPage(server, landingPage, 'restore-a'))?.page.title, 'Original');

  const [latest] = await pageHistory(staff, page.id);
  assert.deepEqual([latest?.version, latest?.kind, latest?.restoredFrom, latest?.live], [3, 'draft', 1, false]);
});

test('restoring checks the version, the editor and the address', async () => {
  const page = newPage('restore-b');
  await save(page, 'draft', 0);
  await save({ ...page, slug: 'restore-b-moved' }, 'draft', 1);

  let result = await restoreRevision(server, landingPage, page.id, 9, { expectedVersion: 2, userId: editor });
  assert.deepEqual([result.ok, !result.ok && result.reason], [false, 'not-found']);
  result = await restoreRevision(server, landingPage, page.id, 1, { expectedVersion: 1, userId: editor });
  assert.deepEqual([result.ok, !result.ok && result.reason], [false, 'conflict']);
  result = await restoreRevision(server, landingPage, page.id, 1, { expectedVersion: 2, userId: viewer });
  assert.deepEqual([result.ok, !result.ok && result.reason], [false, 'forbidden']);

  // Another page took the old address meanwhile.
  await save(newPage('restore-b'), 'draft', 0);
  result = await restoreRevision(server, landingPage, page.id, 1, { expectedVersion: 2, userId: editor });
  assert.deepEqual([result.ok, !result.ok && result.reason], [false, 'slug-taken']);
});

test('pruning keeps each page’s newest drafts, every published version and the current one', async () => {
  const page = newPage('prune-a', 'Version 1');
  await save(page, 'publish', 0);
  for (let version = 2; version <= 7; version++) await save({ ...page, title: `Version ${version}` }, 'draft', version - 1);
  // Make every revision old enough to prune.
  await db.query(`update public.cera_page_revisions set created_at = now() - interval '60 days' where page_id = $1`, [page.id]);

  // Young drafts stay whatever their number.
  assert.equal(await pruneRevisions(server, { keep: 2, olderThanDays: 90 }), 0);
  assert.equal(await pruneRevisions(server, { keep: 2, olderThanDays: 30 }), 4);
  const left = (await pageHistory(staff, page.id)).map((revision) => revision.version);
  // Drafts 6 and 7 (the newest two, 7 being current) and the published version 1.
  assert.deepEqual(left, [7, 6, 1]);
  assert.equal((await getPublishedPage(server, landingPage, 'prune-a'))?.page.title, 'Version 1');

  // Only the server may prune.
  await assert.rejects(pruneRevisions(staff), { code: '42501' });
  await assert.rejects(pruneRevisions(server, { keep: 0 }));
});

test('an old version reads like a working copy, for previewing it from History', async () => {
  const page = newPage('revision-a', 'First');
  await save(page, 'publish', 0);
  await save({ ...page, title: 'Second' }, 'draft', 1);
  const old = await getRevisionPage(server, [landingPage], page.id, 1);
  assert.deepEqual([old?.page.title, old?.page.status, old?.type], ['First', 'draft', landingPage.name]);
  assert.equal(await getRevisionPage(server, [landingPage], page.id, 9), null);
  // Visitors can read only the live version.
  assert.equal((await getRevisionPage(anonymous, [landingPage], page.id, 2)), null);
});
