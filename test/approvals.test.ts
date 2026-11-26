// Authors, settings and approvals: who may do what, one tier and two, sending
// back, and the ways around approval the database must refuse.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  approvalEmail,
  approvalRights,
  NO_APPROVALS,
  pageRights,
  parseApprovalSettings,
  workflowOf,
  type ApprovalNotice,
  type ApprovalSettings,
  type ApproverRole,
  type CeraRole,
  type StoredPage,
} from '../src/index.ts';
import {
  cancelSchedule,
  decideApproval,
  deletePage,
  getApprovalSettings,
  getPageApproval,
  getPublishedPage,
  listPages,
  pageHistory,
  pendingApprovals,
  pruneRevisions,
  publishDuePages,
  restoreRevision,
  saveApprovalSettings,
  savePage,
  unpublishPage,
  withdrawApproval,
} from '../src/supabase/index.ts';
import { createAdminActions } from '../src/next/index.ts';
import { approvalWarnings } from '../src/admin/ApprovalSettingsForm.tsx';
import { landingPage } from '../examples/next-site/cera/content-types/landing-page.ts';
import sample from '../examples/sample-page.json' with { type: 'json' };
import { addUser, createTestDb, fakeSupabase, queryAs } from './support/db.ts';

let db: PGlite;
let server: SupabaseClient;
let staff: SupabaseClient;
const people = {} as Record<'author' | 'author2' | 'editor' | 'editor2' | 'admin' | 'admin2' | 'viewer', string>;

before(async () => {
  db = await createTestDb();
  for (const [name, role] of [['author', 'author'], ['author2', 'author'], ['editor', 'editor'], ['editor2', 'editor'], ['admin', 'admin'], ['admin2', 'admin'], ['viewer', 'viewer']] as const) {
    people[name] = await addUser(db, role);
    await db.query('update auth.users set email = $2 where id = $1', [people[name], `${name}@example.test`]);
  }
  server = fakeSupabase(db, 'service_role');
  staff = fakeSupabase(db, 'authenticated', { sub: people.author, app_metadata: { cera_role: 'author' } });
});

beforeEach(() => configure([]));

async function configure(tiers: ApproverRole[], someoneElse = false) {
  const { version } = await getApprovalSettings(server);
  const result = await saveApprovalSettings(server, { tiers: tiers.length ? { landing_page: tiers } : {}, someoneElse }, { expectedVersion: version, userId: people.admin });
  assert.equal(result.ok, true, JSON.stringify(result));
}

let counter = 0;
function newPage(title = 'Page'): StoredPage {
  const page = structuredClone(sample) as unknown as StoredPage;
  page.id = crypto.randomUUID();
  page.slug = `approval-${++counter}`;
  page.title = title;
  return page;
}

type Person = keyof typeof people;
const HOUR = 60 * 60 * 1000;
const later = (milliseconds = HOUR) => new Date(Date.now() + milliseconds).toISOString();
const save = (person: Person, page: StoredPage, mode: 'draft' | 'publish' | 'schedule' | 'submit', expectedVersion: number, extra: { publishAt?: string; note?: string } = {}) =>
  savePage(server, landingPage, page, { mode, expectedVersion, userId: people[person], ...extra });
async function must(result: Promise<Awaited<ReturnType<typeof save>>>) {
  const saved = await result;
  if (!saved.ok) assert.fail(JSON.stringify(saved));
  return saved;
}
const refused = async (result: Promise<{ ok: boolean; reason?: string } | { ok: true }>) => {
  const outcome = (await result) as { ok: boolean; reason?: string };
  assert.equal(outcome.ok, false, 'expected a refusal');
  return outcome.reason;
};
const live = async (page: StoredPage) => (await getPublishedPage(server, landingPage, page.slug))?.page.title ?? null;
const request = async (page: StoredPage) => (await getPageApproval(staff, page.id))!;
const decide = async (person: Person, page: StoredPage, decision: 'approve' | 'send_back' = 'approve', extra: { publishAt?: string; comment?: string } = {}) =>
  decideApproval(server, { approvalId: (await request(page)).id, decision, ...extra }, { userId: people[person] });
const outcome = async (result: ReturnType<typeof decide>) => {
  const decided = await result;
  return decided.ok ? decided.outcome : decided.reason;
};

test('rights by role and workflow', () => {
  const rights = (role: CeraRole, tiers: ApproverRole[], someoneElse = false) => {
    const { edit, publish, submit, unpublish, remove } = pageRights(role, landingPage, { tiers: { landing_page: tiers }, someoneElse });
    return [edit && 'edit', publish && 'publish', submit && 'submit', unpublish && 'unpublish', remove && 'remove'].filter(Boolean).join(' ');
  };
  for (const tiers of [[], ['editor'], ['admin'], ['editor', 'admin']] as ApproverRole[][]) assert.equal(rights('viewer', tiers), '');
  assert.equal(rights('author', []), 'edit');
  assert.equal(rights('author', ['editor']), 'edit submit');
  assert.equal(rights('editor', []), 'edit publish unpublish remove');
  assert.equal(rights('editor', ['editor']), 'edit publish unpublish remove');
  assert.equal(rights('editor', ['admin']), 'edit submit remove');
  assert.equal(rights('editor', ['editor', 'admin']), 'edit submit remove');
  assert.equal(rights('admin', ['editor', 'admin']), 'edit publish unpublish remove');
  assert.equal(rights('admin', ['editor', 'admin'], true), 'edit submit unpublish remove');
  assert.equal(rights('editor', [], true), 'edit publish unpublish remove');
  // Types that are never published, or that a role can't edit.
  assert.deepEqual(pageRights('author', { name: 'note', publishable: false }, { tiers: { note: ['editor'] }, someoneElse: false }), { edit: true, publish: false, submit: false, unpublish: false, remove: false });
  assert.equal(pageRights('editor', { name: 'form', editRoles: ['admin'] }, NO_APPROVALS).edit, false);

  const decideRights = (role: CeraRole, tiers: ApproverRole[], awaiting: ApproverRole, mine = false, someoneElse = false) => {
    const result = approvalRights({ role, id: 'me' }, landingPage, { tiers: { landing_page: tiers }, someoneElse }, { status: 'pending', awaiting, submittedBy: { id: mine ? 'me' : 'you' } });
    return [result.decide && 'decide', result.final && 'final', result.withdraw && 'withdraw'].filter(Boolean).join(' ');
  };
  assert.equal(decideRights('author', ['editor'], 'editor', true), 'withdraw');
  assert.equal(decideRights('editor', ['editor'], 'editor'), 'decide final');
  assert.equal(decideRights('editor', ['editor', 'admin'], 'editor'), 'decide');
  assert.equal(decideRights('admin', ['editor', 'admin'], 'editor'), 'decide final');
  assert.equal(decideRights('editor', ['editor', 'admin'], 'admin'), '');
  assert.equal(decideRights('admin', ['admin'], 'admin', true, true), 'withdraw');
});

test('settings: parsed, admins only, checked, and not overwritten unseen', async () => {
  assert.deepEqual(parseApprovalSettings({ tiers: { a: ['editor'], b: ['admin', 'editor'], c: [], d: 'x' }, someoneElse: 'yes' }), { tiers: { a: ['editor'] }, someoneElse: false });
  assert.deepEqual(parseApprovalSettings(null), NO_APPROVALS);
  assert.equal(workflowOf(['editor', 'admin']).id, 'editor-admin');

  const settings: ApprovalSettings = { tiers: { landing_page: ['editor', 'admin'] }, someoneElse: true };
  const { version } = await getApprovalSettings(staff);
  for (const person of ['editor', 'author', 'viewer'] as const) assert.equal(await refused(saveApprovalSettings(server, settings, { expectedVersion: version, userId: people[person] })), 'forbidden');
  assert.equal(await refused(saveApprovalSettings(server, settings, { expectedVersion: version - 1, userId: people.admin })), 'conflict');
  assert.equal(await refused(saveApprovalSettings(server, settings, { expectedVersion: 0, userId: people.admin })), 'conflict');
  const saved = await saveApprovalSettings(server, settings, { expectedVersion: version, userId: people.admin });
  assert.deepEqual(saved, { ok: true, settings, version: version + 1 });
  assert.deepEqual(await getApprovalSettings(staff), { settings, version: version + 1 });

  // The database refuses settings it couldn't enforce.
  for (const value of [{}, { tiers: {}, someoneElse: 'no' }, { tiers: { x: ['admin', 'editor'] }, someoneElse: false }, { tiers: { x: ['author'] }, someoneElse: false }, { tiers: { x: [] }, someoneElse: false }, { tiers: [], someoneElse: false }]) {
    const { error } = await server.rpc('cera_save_settings', { p_key: 'approvals', p_value: value, p_expected_version: version + 1, p_user: people.admin });
    assert.equal(error?.code, 'CE400', JSON.stringify(value));
  }
  // Visitors and people without a role don't see them; nobody writes them from a browser.
  await assert.rejects(queryAs(db, 'anon', 'select * from public.cera_settings'), /permission denied/);
  assert.deepEqual(await queryAs(db, 'authenticated', 'select * from public.cera_settings', [], { app_metadata: {} }), []);
  for (const statement of ['update public.cera_settings set version = 9', 'update public.cera_approvals set status = $$approved$$', 'delete from public.cera_approval_events']) {
    await assert.rejects(queryAs(db, 'authenticated', statement, [], { sub: people.admin, app_metadata: { cera_role: 'admin' } }), /permission denied/);
  }
  for (const call of [`cera_user_role('${people.admin}')`, `cera_withdraw_approval('${people.admin}', '${people.admin}')`, `cera_decide_approval('${people.admin}', 'approve', null, null, '${people.admin}')`]) {
    await assert.rejects(queryAs(db, 'authenticated', `select public.${call}`, [], { sub: people.admin, app_metadata: { cera_role: 'admin' } }), /permission denied/);
  }
});

test('warnings about workflows nobody could finish', () => {
  const types = [{ name: 'landing_page', title: 'Pages' }];
  const warn = (tiers: ApproverRole[], someoneElse: boolean, counts: Partial<Record<CeraRole, number>>) => approvalWarnings({ tiers: { landing_page: tiers }, someoneElse }, types, counts).length;
  assert.equal(warn(['admin'], true, { admin: 1, editor: 4 }), 1);
  assert.equal(warn(['admin'], true, { admin: 2 }), 0);
  assert.equal(warn(['editor'], true, { admin: 1 }), 1);
  assert.equal(warn(['editor'], true, { admin: 1, editor: 1 }), 0);
  assert.equal(warn(['editor', 'admin'], false, { admin: 1 }), 1);
  assert.equal(warn(['admin'], false, { admin: 1 }), 0);
  assert.equal(approvalWarnings({ tiers: {}, someoneElse: true }, types, {}).length, 0);
});

test('authors write drafts and never change the live site, approval or not', async () => {
  for (const tiers of [[], ['editor']] as ApproverRole[][]) {
    await configure(tiers);
    const page = newPage('Author draft');
    await must(save('author', page, 'draft', 0));
    await must(save('editor', { ...page, title: 'Live' }, 'publish', 1));
    assert.equal(await refused(save('author', page, 'publish', 2)), 'forbidden');
    assert.equal(await refused(save('author', page, 'schedule', 2, { publishAt: later() })), 'forbidden');
    await assert.rejects(unpublishPage(server, page.id, people.author), /may not edit/);
    await assert.rejects(cancelSchedule(server, page.id, people.author), /may not edit/);
    await must(restoreRevision(server, landingPage, page.id, 1, { expectedVersion: 2, userId: people.author }));
    assert.equal(await live(page), 'Live');

    const draft = newPage('Not live');
    await must(save('author', draft, 'draft', 0));
    assert.equal(await refused(deletePage(server, draft.id, { expectedVersion: 1, userId: people.author })), 'forbidden');
  }
  assert.equal(await refused(save('viewer', newPage(), 'draft', 0)), 'forbidden');
  // Authors read the admin, but not what visitors sent.
  assert.ok((await listPages(staff)).length > 0);
  assert.deepEqual(await queryAs(db, 'authenticated', 'select * from public.cera_form_submissions', [], { app_metadata: { cera_role: 'author' } }), []);
  // Uploads are theirs to add, not to change or delete.
  const { data, error } = await server.rpc('cera_add_media', { p_media: { path: '2026/a.png', kind: 'image' }, p_user: people.author });
  assert.equal(error, null);
  const media = (data as { id: string }).id;
  for (const [name, parameters] of [['cera_update_media', { p_id: media, p_media: { alt: 'x' } }], ['cera_delete_media', { p_id: media }], ['cera_replace_media', { p_id: media, p_media: { path: '2026/b.png' } }]] as const) {
    assert.equal((await server.rpc(name, { ...parameters, p_user: people.author })).error?.code, '42501', name);
  }
});

test('without approval, pages can’t be submitted and editors publish as before', async () => {
  const page = newPage();
  assert.equal(await refused(save('author', page, 'submit', 0)), 'forbidden');
  await must(save('editor', page, 'publish', 0));
  assert.equal(await live(page), 'Page');
});

test('one tier, editors: an author submits, an editor approves exactly that version', async () => {
  await configure(['editor']);
  const page = newPage('Submitted');
  const submitted = await must(save('author', page, 'submit', 0, { note: '  Ready for a look  ' }));
  assert.deepEqual(Object.keys(submitted).sort(), ['id', 'issues', 'ok', 'page', 'revisionId', 'version']);
  assert.equal(await live(page), null);

  let approval = await request(page);
  assert.deepEqual([approval.status, approval.version, approval.awaiting, approval.submittedBy], ['pending', 1, 'editor', { id: people.author, email: 'author@example.test' }]);
  assert.deepEqual(approval.events.map((event) => [event.action, event.by, event.role, event.comment]), [['submitted', 'author@example.test', 'author', 'Ready for a look']]);
  const listed = (await pendingApprovals(staff)).find((pending) => pending.pageId === page.id)!;
  assert.deepEqual([listed.title, listed.awaiting, listed.submittedBy?.id], ['Submitted', 'editor', people.author]);
  assert.deepEqual((await listPages(staff)).find((summary) => summary.id === page.id)?.approval, { status: 'pending', awaiting: 'editor' });

  // Saved afterward: not part of the request.
  await must(save('author', { ...page, title: 'Later edit' }, 'draft', 1));
  assert.equal(await outcome(decide('author2', page)), 'forbidden');
  assert.equal(await outcome(decide('viewer', page)), 'forbidden');
  const id = approval.id;
  assert.equal(await outcome(decide('editor', page, 'approve', { comment: 'Nice' })), 'published');
  assert.equal(await live(page), 'Submitted');
  assert.equal(await getPageApproval(staff, page.id), null);
  assert.equal((await listPages(staff)).find((summary) => summary.id === page.id)?.unpublishedChanges, true);
  // Decided once.
  assert.equal(await refused(decideApproval(server, { approvalId: id, decision: 'approve' }, { userId: people.admin })), 'decided');
  assert.equal(await refused(withdrawApproval(server, id, { userId: people.author })), 'decided');

  const versions = await pageHistory(staff, page.id);
  assert.deepEqual(versions.map((revision) => [revision.version, revision.kind, revision.live]), [[2, 'draft', false], [1, 'publish', true]]);
  assert.deepEqual(versions[1]!.approval?.map((event) => [event.action, event.by]), [['submitted', 'author@example.test'], ['published', 'editor@example.test']]);
  assert.equal(versions[0]!.approval, undefined);

  // Editors publish their own.
  await must(save('editor', { ...page, title: 'Direct' }, 'publish', 2));
  assert.equal(await live(page), 'Direct');
});

test('one tier, admins: editors submit too, and can’t publish, schedule, unpublish or cancel', async () => {
  await configure(['admin']);
  const page = newPage('First');
  assert.equal(await refused(save('editor', page, 'publish', 0)), 'needs-approval');
  assert.equal(await refused(save('editor', page, 'schedule', 0, { publishAt: later() })), 'needs-approval');
  await must(save('editor', page, 'submit', 0));
  assert.equal((await request(page)).awaiting, 'admin');
  assert.equal(await outcome(decide('editor2', page)), 'forbidden');
  assert.equal(await outcome(decide('admin', page)), 'published');
  await assert.rejects(unpublishPage(server, page.id, people.editor), { code: 'CE423' });
  await must(save('admin', { ...page, title: 'Second' }, 'schedule', 1, { publishAt: later() }));
  await assert.rejects(cancelSchedule(server, page.id, people.editor), { code: 'CE423' });
  await cancelSchedule(server, page.id, people.admin);
  await unpublishPage(server, page.id, people.admin);
  assert.equal(await live(page), null);
  // Other content types aren't affected.
  const { error } = await server.rpc('cera_save_page', { p_page: { ...newPage(), contentType: 'other', boxes: {}, panels: [] }, p_expected_version: 0, p_publish: true, p_user: people.editor });
  assert.equal(error, null);
});

test('two tiers: author → editor → admin; editors skip the first, an admin gives both', async () => {
  await configure(['editor', 'admin']);
  const page = newPage('Two tiers');
  await must(save('author', page, 'submit', 0));
  assert.equal(await outcome(decide('editor', page, 'approve', { comment: 'Good' })), 'approved');
  assert.equal(await live(page), null);
  let approval = await request(page);
  assert.deepEqual([approval.status, approval.awaiting], ['pending', 'admin']);
  // The first tier is done: another editor can't decide, or send back what waits for an admin.
  assert.equal(await outcome(decide('editor2', page)), 'forbidden');
  assert.equal(await outcome(decide('editor2', page, 'send_back')), 'forbidden');
  assert.equal(await outcome(decide('admin', page)), 'published');
  assert.equal(await live(page), 'Two tiers');
  assert.deepEqual((await pageHistory(staff, page.id))[0]!.approval?.map((event) => [event.action, event.role]), [['submitted', 'author'], ['approved', 'editor'], ['published', 'admin']]);

  const fromEditor = newPage('From an editor');
  await must(save('editor', fromEditor, 'submit', 0));
  assert.equal((await request(fromEditor)).awaiting, 'admin');
  assert.equal(await outcome(decide('admin', fromEditor)), 'published');

  const straight = newPage('Straight to an admin');
  await must(save('author', straight, 'submit', 0));
  assert.equal(await outcome(decide('admin', straight)), 'published');

  await must(save('admin', newPage('Admins publish'), 'publish', 0));
});

test('someone else must approve: nobody publishes or approves their own', async () => {
  await configure(['editor', 'admin'], true);
  const page = newPage('Admin page');
  assert.equal(await refused(save('admin', page, 'publish', 0)), 'needs-approval');
  assert.equal(await refused(save('admin', page, 'schedule', 0, { publishAt: later() })), 'needs-approval');
  await must(save('admin', page, 'submit', 0));
  assert.equal((await request(page)).awaiting, 'admin');
  assert.equal(await outcome(decide('admin', page)), 'forbidden');
  assert.equal(await outcome(decide('editor', page)), 'forbidden');
  assert.equal(await outcome(decide('admin2', page)), 'published');

  await configure(['editor'], true);
  const byEditor = newPage('Editor page');
  assert.equal(await refused(save('editor', byEditor, 'publish', 0)), 'needs-approval');
  await must(save('editor', byEditor, 'submit', 0));
  assert.equal(await outcome(decide('editor', byEditor)), 'forbidden');
  assert.equal(await outcome(decide('editor2', byEditor)), 'published');
  // Taking a page down doesn't need a second person.
  await unpublishPage(server, byEditor.id, people.editor);
});

test('sending back, resubmitting, withdrawing and replacing', async () => {
  await configure(['editor']);
  const page = newPage('Draft');
  await must(save('author', page, 'submit', 0));
  assert.equal(await outcome(decide('editor', page, 'send_back', { comment: 'Too long' })), 'sent_back');
  let approval = await request(page);
  assert.deepEqual([approval.status, approval.awaiting, approval.events[1]!.comment], ['sent_back', undefined, 'Too long']);
  assert.deepEqual((await listPages(staff)).find((summary) => summary.id === page.id)?.approval, { status: 'sent_back' });
  assert.equal(await live(page), null);

  await must(save('author', { ...page, title: 'Shorter' }, 'submit', 1));
  const second = await request(page);
  assert.deepEqual([second.status, second.version], ['pending', 2]);
  // Only the submitter withdraws.
  assert.equal(await refused(withdrawApproval(server, second.id, { userId: people.admin })), 'forbidden');
  assert.deepEqual(await withdrawApproval(server, second.id, { userId: people.author }), { ok: true });
  assert.equal(await getPageApproval(staff, page.id), null);

  // Submitting again replaces the request, and so does publishing.
  await must(save('author', { ...page, title: 'Third' }, 'submit', 2));
  const third = await request(page);
  await must(save('author2', { ...page, title: 'Fourth' }, 'submit', 3));
  assert.equal(await refused(decideApproval(server, { approvalId: third.id, decision: 'approve' }, { userId: people.editor })), 'decided');
  await must(save('editor', { ...page, title: 'Published over it' }, 'publish', 4));
  assert.equal(await getPageApproval(staff, page.id), null);
  assert.equal(await live(page), 'Published over it');
  assert.deepEqual((await pageHistory(staff, page.id)).map((revision) => revision.approval?.at(-1)?.action), [undefined, 'replaced', 'replaced', 'withdrawn', 'sent_back']);

  // Publishing answers one that was sent back.
  await must(save('author', { ...page, title: 'Again' }, 'submit', 5));
  await decide('editor', page, 'send_back');
  await must(save('editor', { ...page, title: 'Fixed' }, 'publish', 6));
  assert.equal(await getPageApproval(staff, page.id), null);
  assert.equal((await listPages(staff)).find((summary) => summary.id === page.id)?.approval, undefined);

  // Scheduling directly replaces a request too.
  await must(save('author', { ...page, title: 'Once more' }, 'submit', 7));
  await must(save('editor', { ...page, title: 'Scheduled instead' }, 'schedule', 8, { publishAt: later() }));
  assert.equal(await getPageApproval(staff, page.id), null);

  // Only the latest save can be submitted.
  assert.equal(await refused(save('author', page, 'submit', 3)), 'conflict');
});

test('approving for a set time: the request’s time is a wish, the last approver decides', async () => {
  await configure(['editor', 'admin']);
  const page = newPage('Timed');
  const wish = later(2 * HOUR);
  assert.equal(await refused(save('author', page, 'submit', 0, { publishAt: new Date(Date.now() - 1000).toISOString() })), 'bad-time');
  assert.equal(await refused(save('author', page, 'submit', 0, { publishAt: 'soon' })), 'bad-time');
  await must(save('author', page, 'submit', 0, { publishAt: wish }));
  assert.equal(new Date((await request(page)).requestedFor!).toISOString(), wish);
  // Not the last approval: a time changes nothing.
  assert.equal(await outcome(decide('editor', page, 'approve', { publishAt: later() })), 'approved');
  assert.equal(await outcome(decide('admin', page, 'approve', { publishAt: new Date(Date.now() - 1000).toISOString() })), 'bad-time');
  const at = later();
  assert.equal(await outcome(decide('admin', page, 'approve', { publishAt: at })), 'scheduled');
  const summary = (await listPages(staff)).find((candidate) => candidate.id === page.id)!;
  assert.deepEqual([summary.published, new Date(summary.schedule!.at).toISOString(), summary.schedule!.version, summary.approval], [false, at, 1, undefined]);
  await must(save('author', { ...page, title: 'Later draft' }, 'draft', 1));
  await queryAs(db, 'service_role', `update public.cera_page_revisions set scheduled_for = now() - interval '1 second' where page_id = $1 and schedule_status = 'pending'`, [page.id]);
  assert.equal(await publishDuePages(server), 1);
  assert.equal(await live(page), 'Timed');

  // Publishing an approved version cancels an older schedule, so it can't go live over it.
  await must(save('admin', { ...page, title: 'Old plan' }, 'schedule', 2, { publishAt: later() }));
  await must(save('author', { ...page, title: 'Newer' }, 'submit', 3));
  assert.equal(await outcome(decide('admin', page)), 'published');
  assert.equal((await listPages(staff)).find((candidate) => candidate.id === page.id)?.schedule, undefined);
});

test('a submitted page must be ready to go live, at an address that’s free', async () => {
  await configure(['editor']);
  assert.equal(await refused(save('author', { ...newPage(), title: '' }, 'submit', 0)), 'invalid');

  const first = newPage('First');
  await must(save('author', first, 'submit', 0));
  // Frees the working address; the submitted version keeps it.
  await must(save('author', { ...first, slug: `${first.slug}-moved` }, 'draft', 1));
  const rival = { ...newPage('Rival'), slug: first.slug };
  await must(save('editor', rival, 'publish', 0));
  assert.equal(await outcome(decide('editor', first)), 'slug-taken');
  assert.equal((await request(first)).status, 'pending');
  assert.equal(await live(rival), 'Rival');
  // And a taken address can't be submitted.
  await must(save('editor', { ...rival, slug: `${rival.slug}-elsewhere` }, 'draft', 1));
  assert.equal(await refused(save('author', { ...newPage(), slug: first.slug }, 'submit', 0)), 'slug-taken');
});

test('requests follow the settings as they are now', async () => {
  await configure(['editor']);
  const raised = newPage('Raised');
  await must(save('author', raised, 'submit', 0));
  await configure(['admin']);
  assert.equal((await request(raised)).awaiting, 'admin');
  assert.equal(await outcome(decide('editor', raised)), 'forbidden');
  assert.equal(await outcome(decide('admin', raised)), 'published');

  // A tier added after an editor approved: it waits for the admin.
  await configure(['editor', 'admin']);
  const lowered = newPage('Lowered');
  await must(save('author', lowered, 'submit', 0));
  await decide('editor', lowered);
  await configure(['editor']);
  assert.equal((await request(lowered)).awaiting, 'editor');
  assert.equal(await outcome(decide('editor2', lowered)), 'published');

  // Turned off: an editor still finishes it, an author still can't.
  await configure(['admin']);
  const off = newPage('Off');
  await must(save('editor', off, 'submit', 0));
  await configure([]);
  assert.equal(await outcome(decide('author', off)), 'forbidden');
  assert.equal(await outcome(decide('editor', off)), 'published');
  // Someone whose access was removed can't decide any more.
  await configure(['editor']);
  const gone = newPage('Gone');
  await must(save('author', gone, 'submit', 0));
  const former = await addUser(db, 'editor');
  await db.query(`update auth.users set raw_app_meta_data = '{}' where id = $1`, [former]);
  assert.equal(await refused(decideApproval(server, { approvalId: (await request(gone)).id, decision: 'approve' }, { userId: former })), 'forbidden');
});

test('media: replacing a live file needs an approver; waiting versions keep their files', async () => {
  const path = `2026/${crypto.randomUUID()}.png`;
  const { data } = await server.rpc('cera_add_media', { p_media: { path, kind: 'image' }, p_user: people.editor });
  const media = (data as { id: string }).id;
  const page = newPage('With a file');
  page.boxes = { ...page.boxes, seo: { ...page.boxes.seo, image: { id: media, path, kind: 'image' } } };
  const clean = { ...page, boxes: { ...page.boxes, seo: {} } };

  await configure(['admin']);
  await must(save('author', page, 'submit', 0));
  // Only the waiting version uses it now: it can't be deleted.
  await must(save('author', clean, 'draft', 1));
  assert.equal((await server.rpc('cera_delete_media', { p_id: media, p_user: people.editor })).error?.code, 'CE409');
  assert.deepEqual(await queryAs(db, 'service_role', 'select public.cera_media_in_use($1) as used', [path]), [{ used: true }]);
  // Nothing live uses it, so an editor may replace it, and the waiting version follows.
  const next = `2026/${crypto.randomUUID()}.png`;
  assert.equal((await server.rpc('cera_replace_media', { p_id: media, p_media: { path: next, kind: 'image' }, p_user: people.editor })).error, null);
  assert.equal(await outcome(decide('admin', page)), 'published');
  const [row] = await queryAs<{ text: string }>(db, 'service_role', 'select boxes::text as text from public.cera_page_revisions where page_id = $1 and is_published', [page.id]);
  assert.ok(row!.text.includes(next));

  // Live now: replacing it changes the live site at once.
  const last = `2026/${crypto.randomUUID()}.png`;
  assert.equal((await server.rpc('cera_replace_media', { p_id: media, p_media: { path: last, kind: 'image' }, p_user: people.editor })).error?.code, 'CE423');
  assert.equal((await server.rpc('cera_replace_media', { p_id: media, p_media: { path: last, kind: 'image' }, p_user: people.admin })).error, null);
});

test('pruning keeps submitted versions; deleting a page takes its requests along', async () => {
  await configure(['editor']);
  const page = newPage('Kept');
  await must(save('author', page, 'submit', 0));
  for (let version = 1; version < 4; version++) await must(save('author', { ...page, title: `Draft ${version}` }, 'draft', version));
  await queryAs(db, 'service_role', `update public.cera_page_revisions set created_at = now() - interval '1 year' where page_id = $1`, [page.id]);
  await pruneRevisions(server, { keep: 1, olderThanDays: 1 });
  assert.deepEqual((await pageHistory(staff, page.id)).map((revision) => revision.version), [4, 1]);
  assert.equal((await deletePage(server, page.id, { expectedVersion: 4, userId: people.editor })).ok, true);
  assert.equal((await pendingApprovals(staff)).some((pending) => pending.pageId === page.id), false);
});

test('the server actions: the session decides, the live site is refreshed, and the right people are told', async () => {
  await configure(['editor', 'admin']);
  const notices: ApprovalNotice[] = [];
  let refreshes = 0;
  const users = (Object.keys(people) as Person[]).map((name) => ({ id: people[name], email: `${name}@example.test`, app_metadata: { cera_role: name.replace(/\d$/, '') } }));
  const service = Object.assign(fakeSupabase(db, 'service_role'), { auth: { admin: { listUsers: async () => ({ data: { users }, error: null }) } } }) as unknown as SupabaseClient;
  const as = (person: Person) => {
    const role = person.replace(/\d$/, '') as CeraRole;
    const client = fakeSupabase(db, 'authenticated', { sub: people[person], app_metadata: { cera_role: role } });
    const rank = ['viewer', 'author', 'editor', 'admin'];
    return createAdminActions({
      contentTypes: [landingPage],
      staff: async (minimum = 'viewer') => {
        if (rank.indexOf(role) < rank.indexOf(minimum)) throw new Error('forbidden');
        return { client, role, user: { id: people[person], email: `${person}@example.test` } as never };
      },
      userClient: async () => client,
      serviceClient: () => service,
      liveChanged: () => void refreshes++,
      approvalChanged: (notice) => void notices.push(notice),
    });
  };
  const told = async (count: number) => {
    for (let wait = 0; notices.length < count && wait < 100; wait++) await new Promise((resolve) => setTimeout(resolve, 20));
    const { action, to, by, awaiting, comment } = notices.at(-1)!;
    return { action, to: [...to].sort(), by, awaiting, comment };
  };

  const page = newPage('Through the actions');
  await assert.rejects(as('viewer').savePage({ page, expectedVersion: 0, mode: 'draft' }), /forbidden/);
  const submitted = await as('author').savePage({ page, expectedVersion: 0, mode: 'submit', note: 'Please' });
  assert.ok(submitted.ok);
  assert.equal(submitted.approval?.awaiting, 'editor');
  assert.deepEqual(await told(1), { action: 'submitted', to: ['editor2@example.test', 'editor@example.test'], by: 'author@example.test', awaiting: 'editor', comment: 'Please' });

  const approvalId = submitted.approval!.id;
  await assert.rejects(as('author').decideApproval({ approvalId, decision: 'approve' }), /forbidden/);
  const passed = await as('editor').decideApproval({ approvalId, decision: 'approve' });
  assert.ok(passed.ok && passed.outcome === 'approved' && passed.approval?.awaiting === 'admin');
  assert.deepEqual(await told(2), { action: 'approved', to: ['admin2@example.test', 'admin@example.test'], by: 'editor@example.test', awaiting: 'admin', comment: undefined });
  assert.equal(refreshes, 0);
  const published = await as('admin').decideApproval({ approvalId, decision: 'approve', comment: 'Lovely' });
  assert.ok(published.ok && published.outcome === 'published' && published.approval === null);
  assert.equal(refreshes, 1);
  assert.deepEqual(await told(3), { action: 'published', to: ['author@example.test'], by: 'admin@example.test', awaiting: undefined, comment: 'Lovely' });

  assert.equal(await refused(as('admin').decideApproval({ approvalId: 'nope', decision: 'approve' })), 'not-found');
  assert.equal(await refused(as('admin').decideApproval({ approvalId: crypto.randomUUID(), decision: 'approve' })), 'not-found');
  await assert.rejects(as('editor').saveApprovalSettings({ settings: NO_APPROVALS, expectedVersion: 1 }), /forbidden/);
  const { version } = await getApprovalSettings(server);
  const saved = await as('admin').saveApprovalSettings({ settings: { tiers: { landing_page: ['admin'], unknown: ['admin'] }, someoneElse: false }, expectedVersion: version });
  assert.deepEqual(saved.ok && saved.settings, { tiers: { landing_page: ['admin'] }, someoneElse: false });

  // A decision that isn't one is refused, not taken as either.
  await must(save('author', { ...page, title: 'Next' }, 'submit', 1));
  const odd = await as('admin').decideApproval({ approvalId: (await request(page)).id, decision: 'maybe' as never });
  assert.equal(odd.ok, false);
  assert.equal((await request(page)).status, 'pending');
});

test('emails escape what people wrote, and keep titles on one line', () => {
  const notice: ApprovalNotice = { action: 'sent_back', page: { id: 'p', title: 'A\r\nBcc: x <b>', contentType: 'landing_page', contentTypeLabel: 'Page' }, version: 2, by: 'ed@example.test', comment: '<script>alert(1)</script>\nShorter', to: ['author@example.test'] };
  const email = approvalEmail(notice, 'https://example.test/admin/pages/p')!;
  assert.equal(email.subject, 'Sent back: A Bcc: x <b>');
  assert.ok(!email.html.includes('<script>') && !email.html.includes('<b>'));
  assert.ok(email.text.includes('Shorter') && email.text.endsWith('https://example.test/admin/pages/p'));
  assert.equal(approvalEmail({ ...notice, to: [] }, 'https://example.test'), null);
});
