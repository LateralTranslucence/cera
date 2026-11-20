// Scheduled publishing and the admin's page list: schedule → (due) → live,
// replacing, cancelling, failures, and what the list reports.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cancelSchedule, getPageForEditing, getPublishedPage, listPages, publishDuePages, savePage, unpublishPage } from '../src/supabase/index.ts';
import type { StoredPage } from '../src/index.ts';
import { landingPage } from '../examples/next-site/cera/content-types/landing-page.ts';
import sample from '../examples/sample-page.json' with { type: 'json' };
import { addUser, createTestDb, fakeSupabase, queryAs } from './support/db.ts';

let db: PGlite;
let editor: string;
let viewer: string;
let server: SupabaseClient;
let staff: SupabaseClient;

before(async () => {
  db = await createTestDb();
  editor = await addUser(db, 'editor');
  viewer = await addUser(db, 'viewer');
  server = fakeSupabase(db, 'service_role');
  staff = fakeSupabase(db, 'authenticated', { sub: viewer, app_metadata: { cera_role: 'viewer' } });
});

const HOUR = 60 * 60 * 1000;
const later = (ms = HOUR) => new Date(Date.now() + ms).toISOString();

function newPage(slug: string, title = slug): StoredPage {
  const p = structuredClone(sample) as unknown as StoredPage;
  p.id = crypto.randomUUID();
  p.slug = slug;
  p.title = title;
  return p;
}

async function save(page: StoredPage, mode: 'draft' | 'publish' | 'schedule', expectedVersion: number, publishAt?: string) {
  const result = await savePage(server, landingPage, page, { mode, expectedVersion, userId: editor, publishAt });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('unreachable');
  return result;
}

/** Makes every pending schedule due now, as if its time had come. */
async function makeDue() {
  await queryAs(db, 'service_role', `update public.cera_page_revisions set scheduled_for = now() - interval '1 second' where schedule_status = 'pending'`);
}

const summary = async (id: string) => (await listPages(server)).find((p) => p.id === id)!;

test('a scheduled version goes live when due, and edits made after it stay unpublished', async () => {
  const page = newPage('sched-a', 'Version 1');
  await save(page, 'publish', 0);
  const at = later();
  const scheduled = await save({ ...page, title: 'Version 2' }, 'schedule', 1, at);
  assert.equal(scheduled.version, 2);

  let s = await summary(page.id);
  assert.deepEqual([s.published, s.unpublishedChanges, s.schedule?.version], [true, true, 2]);
  assert.equal(new Date(s.schedule!.at).toISOString(), at);
  const editing = await getPageForEditing(server, landingPage, page.id);
  assert.deepEqual([editing?.liveVersion, editing?.schedule?.version], [1, 2]);

  // Keep editing after scheduling: the schedule still publishes the version it was given.
  await save({ ...page, title: 'Version 3' }, 'draft', 2);
  assert.equal(await publishDuePages(server), 0); // not due yet
  assert.equal((await getPublishedPage(server, landingPage, 'sched-a'))?.page.title, 'Version 1');

  await makeDue();
  assert.equal(await publishDuePages(server), 1);
  assert.equal((await getPublishedPage(server, landingPage, 'sched-a'))?.page.title, 'Version 2');
  s = await summary(page.id);
  assert.deepEqual([s.published, s.unpublishedChanges, s.schedule], [true, true, undefined]);
  assert.equal(await publishDuePages(server), 0); // nothing runs twice
});

test('a page that was never published can be scheduled', async () => {
  const page = newPage('sched-new');
  await save(page, 'schedule', 0, later());
  let s = await summary(page.id);
  assert.deepEqual([s.published, s.unpublishedChanges, Boolean(s.schedule)], [false, false, true]);
  assert.equal(await getPublishedPage(server, landingPage, 'sched-new'), null);
  await makeDue();
  await publishDuePages(server);
  s = await summary(page.id);
  assert.deepEqual([s.published, s.unpublishedChanges, s.schedule], [true, false, undefined]);
});

test('scheduling again replaces the schedule; publishing now, unpublishing and cancelling end it', async () => {
  const page = newPage('sched-b');
  await save(page, 'publish', 0);
  await save({ ...page, title: 'First plan' }, 'schedule', 1, later());
  await save({ ...page, title: 'Second plan' }, 'schedule', 2, later(2 * HOUR));
  const [{ n } = { n: -1 }] = await queryAs<{ n: number }>(db, 'service_role', `select count(*)::int as n from public.cera_page_revisions where page_id = $1 and schedule_status = 'pending'`, [page.id]);
  assert.equal(n, 1);
  assert.equal((await summary(page.id)).schedule?.version, 3);

  // Publishing now: a pending schedule would put older content back later, so it's cancelled.
  await save({ ...page, title: 'Published now' }, 'publish', 3);
  assert.equal((await summary(page.id)).schedule, undefined);
  await makeDue();
  assert.equal(await publishDuePages(server), 0);
  assert.equal((await getPublishedPage(server, landingPage, 'sched-b'))?.page.title, 'Published now');

  await save({ ...page, title: 'Plan again' }, 'schedule', 4, later());
  await unpublishPage(server, page.id, editor);
  assert.equal((await summary(page.id)).schedule, undefined);

  await save({ ...page, title: 'And again' }, 'schedule', 5, later());
  await cancelSchedule(server, page.id, editor);
  assert.equal((await summary(page.id)).schedule, undefined);
});

test('scheduling needs a future time and a page that could be published', async () => {
  const page = newPage('sched-c');
  await save(page, 'draft', 0);
  for (const publishAt of [new Date(Date.now() - 1000).toISOString(), 'not a date', undefined]) {
    const result = await savePage(server, landingPage, page, { mode: 'schedule', expectedVersion: 1, userId: editor, publishAt });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'bad-time');
  }
  // The database checks the time too.
  const { error } = await server.rpc('cera_schedule_page', { p_page: page, p_expected_version: 1, p_publish_at: new Date(Date.now() - 1000).toISOString(), p_user: editor });
  assert.equal(error?.code, 'CE400');

  // Validated like a publish: an empty title is an error, not a warning.
  const untitled = await savePage(server, landingPage, { ...page, title: '' }, { mode: 'schedule', expectedVersion: 1, userId: editor, publishAt: later() });
  assert.equal(untitled.ok, false);
  if (!untitled.ok) assert.equal(untitled.reason, 'invalid');

  // Viewers can't schedule.
  const viewerSave = await savePage(server, landingPage, page, { mode: 'schedule', expectedVersion: 1, userId: viewer, publishAt: later() });
  assert.equal(viewerSave.ok, false);
  if (!viewerSave.ok) assert.equal(viewerSave.reason, 'forbidden');
});

test('a schedule whose address went live elsewhere fails without stopping the others', async () => {
  // Live addresses are checked when scheduling...
  const live = newPage('sched-taken');
  await save(live, 'publish', 0);
  await save({ ...live, slug: 'sched-taken-renamed' }, 'draft', 1); // the working copy moves; the live version stays
  const late = await savePage(server, landingPage, newPage('sched-taken'), { mode: 'schedule', expectedVersion: 0, userId: editor, publishAt: later() });
  assert.equal(late.ok, false);
  if (!late.ok) assert.equal(late.reason, 'slug-taken');

  // ...but an address can still go live elsewhere before the schedule runs.
  const first = newPage('sched-clash');
  await save(first, 'schedule', 0, later());
  await save({ ...first, slug: 'sched-clash-later' }, 'draft', 1); // frees the working address; the scheduled version keeps it
  const rival = newPage('sched-clash', 'Rival');
  await save(rival, 'publish', 0);
  const other = newPage('sched-ok');
  await save(other, 'schedule', 0, later());

  await makeDue();
  assert.equal(await publishDuePages(server), 1);
  const s = await summary(first.id);
  assert.deepEqual([s.published, s.schedule, s.scheduleFailed], [false, undefined, 'Another page went live at this address first.']);
  assert.equal((await summary(other.id)).published, true);
  assert.equal((await getPublishedPage(server, landingPage, 'sched-clash'))?.page.title, 'Rival');

  // Publishing it afterwards clears the failure.
  await save({ ...first, slug: 'sched-clash-later' }, 'publish', 2);
  assert.equal((await summary(first.id)).scheduleFailed, undefined);
});

test('the page list: who saved last, panel counts, and who may read it', async () => {
  const page = newPage('list-a', 'Listed');
  await save(page, 'draft', 0);
  await db.query(`update auth.users set email = 'ed@example.test' where id = $1`, [editor]);

  const s = (await listPages(staff)).find((p) => p.id === page.id);
  assert.ok(s);
  assert.deepEqual([s.updatedBy, s.panelCount, s.published], ['ed@example.test', 2, false]);
  assert.ok((await listPages(staff, { contentType: 'landing_page' })).some((p) => p.id === page.id));
  assert.equal((await listPages(staff, { contentType: 'other' })).length, 0);

  // Someone signed in without a Cera role sees no pages and no emails.
  const nobody = fakeSupabase(db, 'authenticated', { sub: crypto.randomUUID(), app_metadata: {} });
  assert.deepEqual(await listPages(nobody), []);
  const [row] = await queryAs<{ email: string | null }>(db, 'authenticated', 'select public.cera_user_email($1) as email', [editor], { sub: crypto.randomUUID(), app_metadata: {} });
  assert.equal(row?.email, null);

  // Visitors can't call it, or schedule anything.
  await assert.rejects(queryAs(db, 'anon', 'select * from public.cera_page_summaries()'), /permission denied/);
  await assert.rejects(queryAs(db, 'authenticated', 'select public.cera_publish_due()', [], { sub: editor, app_metadata: { cera_role: 'editor' } }), /permission denied/);
});
