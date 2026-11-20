// Forms: what visitors see (publicForm), checking what they send
// (checkSubmission), the anti-spam token, CSV export, and the endpoint end to
// end against the database: storing, refusing, rate limits and access.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkSubmission, formType, publicForm, submissionsCsv, type FormField, type FormResponse, type PublicForm } from '../src/forms/index.ts';
import { checkFormToken, issueFormToken, MAX_AGE_MS } from '../src/forms/server.ts';
import { createFormHandler } from '../src/next/forms.ts';
import { readPage, type StoredPage } from '../src/index.ts';
import { deletePage, deleteSubmissions, listSubmissions, savePage, submissionCounts, unpublishPage } from '../src/supabase/index.ts';
import { addUser, createTestDb, fakeSupabase } from './support/db.ts';

const field = (type: string, data: Record<string, unknown>, hidden = false) => ({
  id: crypto.randomUUID(),
  type: `cera/field-${type}`,
  v: 1,
  hidden,
  data,
});

function storedForm(panels: StoredPage['panels'], boxes: StoredPage['boxes'] = {}, slug = 'contact'): StoredPage {
  return {
    id: crypto.randomUUID(),
    contentType: 'cera_form',
    slug,
    title: 'Contact',
    boxes,
    panels,
  };
}

const toPublic = (stored: StoredPage, version = 1) => publicForm(readPage(formType, stored, { status: 'published' }).page, version);

const contact = (slug = 'contact') =>
  storedForm(
    [
      field('text', {
        label: 'Your name',
        required: true,
        autocomplete: 'name',
      }),
      field('email', { label: 'Email', required: true }),
      field('section', { legend: 'About you' }),
      field('select', {
        label: 'Topic',
        options: [
          { _id: 'a', label: 'Sales' },
          { _id: 'b', label: 'Support', value: 'help' },
        ],
      }),
      field('checkbox', {
        label: 'Interests',
        options: [
          { _id: 'c', label: 'Stars' },
          { _id: 'd', label: 'Planets' },
          { _id: 'e', label: 'Moons' },
        ],
      }),
      field('section', { legend: '' }),
      field('textarea', { label: 'Message', required: true }),
      field('binary', { label: 'Keep me posted' }),
      field('toggle', { label: 'Newsletter', onLabel: 'Subscribed' }),
      field('range', { label: 'Rating', min: 1, max: 5, step: 2 }),
      field('hidden', {
        label: 'Source',
        value: 'site',
        fromQuery: 'utm_source',
      }),
      field('phone', { label: 'Phone' }, true),
    ],
    {},
    slug,
  );

test('publicForm: unique names, sections, options and settings', () => {
  const form = toPublic(
    storedForm(
      [
        field('text', { label: 'Name' }),
        field('text', { label: 'Name' }),
        field('text', { label: 'Website', name: 'cera-website' }),
        field('section', { legend: 'More', note: 'Optional' }),
        field('radio', {
          label: 'Pick',
          options: [
            { _id: '1', label: 'One' },
            { _id: '2', label: 'One' },
            { _id: '3', label: '' },
          ],
        }),
        field('range', { label: 'Size', min: 10, max: 5, step: 0 }),
        field('section', { legend: '' }),
        field('email', { label: 'Email' }, true),
        field('hidden', { label: 'Ref', required: true }),
      ],
      { onSubmit: { thankYouRedirect: '//evil.example/' } },
    ),
  );
  const names = form.items.map((i) => (i.type === 'section' ? `[${i.legend}: ${i.fields.map((f) => f.name).join(', ')}]` : i.name));
  // Duplicates and reserved names get a number; the hidden panel is left out;
  // an empty section heading ends the section.
  assert.deepEqual(names, ['name', 'name-2', 'cera-website-2', '[More: pick, size]', 'ref']);
  const section = form.items[3] as { fields: FormField[]; note?: string };
  assert.equal(section.note, 'Optional');
  assert.deepEqual(section.fields[0]!.options, [{ label: 'One', value: 'One' }]);
  assert.deepEqual([section.fields[1]!.min, section.fields[1]!.max, section.fields[1]!.step], [10, 10, 1]);
  assert.equal((form.items[4] as FormField).required, false, 'hidden fields are never required');
  assert.equal(form.submitText, 'Submit');
  assert.match(form.thankYouText, /Thank you/);
  assert.equal(form.thankYouRedirect, undefined, 'only paths on this site');
  assert.equal(toPublic(storedForm([], { onSubmit: { thankYouRedirect: '/thanks' } })).thankYouRedirect, '/thanks');
});

test('checkSubmission: required answers, formats and choices', () => {
  const form = toPublic(contact());
  const send = (values: Record<string, string | string[]>) => checkSubmission(form, (n) => [values[n] ?? []].flat());

  const empty = send({ rating: '1' });
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.deepEqual(Object.keys(empty.errors).sort(), ['email', 'message', 'your-name']);

  const wrong = send({
    'your-name': 'Ada',
    email: 'ada@',
    message: 'Hi',
    topic: 'Billing',
    interests: ['Stars', 'Comets'],
    rating: '2',
    'keep-me-posted': 'maybe',
  });
  assert.equal(wrong.ok, false);
  if (!wrong.ok) {
    assert.deepEqual(wrong.errors, {
      email: 'Enter an email address like name@example.com.',
      topic: 'Choose one of the options.',
      interests: 'Choose from the options.',
      'keep-me-posted': 'Tick the box or leave it empty.',
      rating: 'Choose a number from 1 to 5.',
    });
  }

  const good = send({
    'your-name': '  Ada\u0007 Lovelace ',
    email: 'ada@example.com',
    topic: 'help',
    interests: ['Moons', 'Stars', 'Stars'],
    message: 'Line one\r\nLine two',
    'keep-me-posted': 'yes',
    newsletter: 'on',
    rating: '3',
    source: 'newsletter',
    phone: '555',
    extra: 'ignored',
  });
  assert.equal(good.ok, true, JSON.stringify(good));
  if (!good.ok) return;
  assert.equal(good.email, 'ada@example.com');
  assert.deepEqual(
    good.values.map((v) => [v.name, v.value]),
    [
      ['your-name', 'Ada  Lovelace'],
      ['email', 'ada@example.com'],
      ['topic', 'help'],
      ['interests', ['Stars', 'Moons']],
      ['message', 'Line one\nLine two'],
      ['keep-me-posted', 'Yes'],
      ['newsletter', 'Subscribed'],
      ['rating', '3'],
      ['source', 'newsletter'],
    ],
  );

  const long = send({
    'your-name': 'x'.repeat(501),
    email: 'a@b.co',
    message: 'Hi',
    rating: '1',
  });
  assert.equal(!long.ok && long.errors['your-name'], 'Use at most 500 characters.');
});

test('form tokens: only for that form, a few seconds to a day old', () => {
  const now = 1_800_000_000_000;
  const id = crypto.randomUUID();
  const token = issueFormToken('s3cret', id, now);
  assert.equal(checkFormToken('s3cret', id, token, now + 500), 'too-fast');
  assert.equal(checkFormToken('s3cret', id, token, now + 5_000), 'ok');
  assert.equal(checkFormToken('s3cret', id, token, now + MAX_AGE_MS + 1), 'expired');
  assert.equal(checkFormToken('s3cret', crypto.randomUUID(), token, now + 5_000), 'invalid');
  assert.equal(checkFormToken('other', id, token, now + 5_000), 'invalid');
  assert.equal(checkFormToken('s3cret', id, `${now - 60_000}.${token.split('.')[1]}`, now + 5_000), 'invalid');
  assert.equal(checkFormToken('s3cret', id, '', now), 'invalid');
});

test('submissionsCsv: a column per field, quoted, formulas defused', () => {
  const csv = submissionsCsv([
    {
      createdAt: '2026-11-20T10:00:00Z',
      formTitle: 'Contact',
      email: 'a@b.co',
      values: [
        { name: 'msg', label: 'Message', value: 'Hi, "there"\nbye' },
        { name: 'i', label: 'Interests', value: ['A', 'B'] },
      ],
    },
    {
      createdAt: '2026-11-20T11:00:00Z',
      formTitle: 'Contact',
      values: [
        { name: 'msg', label: 'Message', value: '=HYPERLINK("x")' },
        { name: 'extra', label: 'Extra', value: '-1' },
      ],
    },
  ]);
  assert.equal(
    csv,
    [
      'Sent,Form,Contact email,Page,Message,Interests,Extra',
      '2026-11-20T10:00:00Z,Contact,a@b.co,,"Hi, ""there""\nbye",A; B,',
      `2026-11-20T11:00:00Z,Contact,,,"'=HYPERLINK(""x"")",,'-1`,
      '',
    ].join('\r\n'),
  );
});

/* ------------------------------------------------------------------ */
/* The endpoint, against the database                                  */
/* ------------------------------------------------------------------ */

let db: PGlite;
let editor: string;
let server: SupabaseClient;
let staffEditor: SupabaseClient;
let staffViewer: SupabaseClient;
let anon: SupabaseClient;
const SECRET = 'test-secret';

before(async () => {
  db = await createTestDb();
  editor = await addUser(db, 'editor');
  const viewer = await addUser(db, 'viewer');
  server = fakeSupabase(db, 'service_role');
  staffEditor = fakeSupabase(db, 'authenticated', {
    sub: editor,
    app_metadata: { cera_role: 'editor' },
  });
  staffViewer = fakeSupabase(db, 'authenticated', {
    sub: viewer,
    app_metadata: { cera_role: 'viewer' },
  });
  anon = fakeSupabase(db, 'anon');
});

async function publish(stored: StoredPage, expectedVersion = 0) {
  const result = await savePage(server, formType, stored, {
    mode: 'publish',
    expectedVersion,
    userId: editor,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

function handler(limit = { max: 5, minutes: 10 }, ip = '203.0.113.7') {
  const submitted: string[] = [];
  const h = createFormHandler({
    client: () => server,
    secret: () => SECRET,
    ip: () => ip,
    limit,
    afterSubmit: ({ id }) => void submitted.push(id),
  });
  return { ...h, submitted };
}

async function post(h: ReturnType<typeof handler>, formId: string, values: Record<string, string>, token = issueFormToken(SECRET, formId, Date.now() - 5_000)) {
  const body = new FormData();
  body.set('cera-form', formId);
  body.set('cera-token', token);
  body.set('cera-page', '/contact-us');
  for (const [k, v] of Object.entries(values)) body.append(k, v);
  const res = await h.POST(new Request('http://localhost/api/cera/forms', { method: 'POST', body }));
  return { status: res.status, body: (await res.json()) as FormResponse };
}

const valid = {
  'your-name': 'Ada',
  email: 'ada@example.com',
  message: 'Hello',
  rating: '1',
};

test('the endpoint stores a valid submission to a live form', async () => {
  const stored = contact();
  await publish(stored);
  const h = handler();

  const get = await h.GET(new Request(`http://localhost/api/cera/forms?form=${stored.id}`));
  const { token } = (await get.json()) as { token: string };
  assert.equal(get.headers.get('cache-control'), 'no-store');
  // Straight away is too fast…
  assert.deepEqual((await post(h, stored.id, valid, token)).body.ok, false);

  // …a few seconds later it's fine.
  const sent = await post(h, stored.id, { ...valid, interests: 'Planets' });
  assert.deepEqual(sent, { status: 200, body: { ok: true } });
  assert.equal(h.submitted.length, 1);

  const [row] = await listSubmissions(staffEditor, { formId: stored.id });
  assert.equal(row?.email, 'ada@example.com');
  assert.equal(row?.pagePath, '/contact-us');
  assert.equal(row?.formVersion, 1);
  assert.deepEqual(row?.values.find((v) => v.name === 'interests')?.value, ['Planets']);
  // The sender key is a hash, not the address.
  const keys = await db.query<{ sender_key: string }>('select sender_key from public.cera_form_submissions');
  assert.ok(keys.rows.every((r) => !r.sender_key.includes('203.0.113.7')));
});

test('the endpoint refuses bots, bad answers and forms that aren’t live', async () => {
  const stored = contact('refusals');
  await publish(stored);
  const h = handler();

  // Honeypot: looks like success, stores nothing.
  assert.deepEqual(
    await post(h, stored.id, {
      ...valid,
      'cera-website': 'http://spam.example',
    }),
    { status: 200, body: { ok: true } },
  );
  assert.equal((await listSubmissions(staffEditor, { formId: stored.id })).length, 0);

  const forged = await post(h, stored.id, valid, `${Date.now() - 5_000}.forged`);
  assert.deepEqual([forged.status, forged.body.ok === false && forged.body.reason], [403, 'bad-request']);

  const old = await post(h, stored.id, valid, issueFormToken(SECRET, stored.id, Date.now() - MAX_AGE_MS - 1_000));
  assert.equal(old.status, 409);
  assert.ok(!old.body.ok && old.body.reason === 'expired' && old.body.token, 'an expired token comes back with a fresh one');
  if (!old.body.ok && old.body.reason === 'expired') assert.equal((await post(h, stored.id, valid, old.body.token)).body.ok, true);

  const invalid = await post(h, stored.id, { email: 'nope' });
  assert.equal(invalid.status, 422);
  assert.ok(!invalid.body.ok && invalid.body.reason === 'invalid' && invalid.body.errors.email);

  const draft = storedForm([field('text', { label: 'Name' })], {}, 'draft-only');
  assert.equal(
    (
      await savePage(server, formType, draft, {
        mode: 'draft',
        expectedVersion: 0,
        userId: editor,
      })
    ).ok,
    true,
  );
  const notLive = await post(h, draft.id, { name: 'x' });
  assert.deepEqual([notLive.status, !notLive.body.ok && notLive.body.reason], [404, 'not-live']);
});

test('the endpoint limits how often one sender can submit', async () => {
  const stored = storedForm([field('text', { label: 'Name' })], {}, 'limited');
  await publish(stored);
  const h = handler({ max: 2, minutes: 10 }, '198.51.100.1');
  assert.equal((await post(h, stored.id, { name: 'a' })).body.ok, true);
  // Refused answers don't count towards the limit.
  assert.equal((await post(h, stored.id, { name: 'x'.repeat(600) })).status, 422);
  assert.equal((await post(h, stored.id, { name: 'b' })).body.ok, true);
  const third = await post(h, stored.id, { name: 'c' });
  assert.deepEqual([third.status, !third.body.ok && third.body.reason], [429, 'rate-limited']);
  // Someone else still can.
  assert.equal(
    (
      await post(handler({ max: 2, minutes: 10 }, '198.51.100.2'), stored.id, {
        name: 'd',
      })
    ).body.ok,
    true,
  );
});

test('only admins and editors read and delete submissions; a form with submissions can’t be deleted', async () => {
  const stored = storedForm([field('text', { label: 'Name' })], {}, 'access');
  await publish(stored);
  const h = handler({ max: 10, minutes: 10 }, '192.0.2.9');
  await post(h, stored.id, { name: 'one' });
  await post(h, stored.id, { name: 'two' });

  assert.equal((await listSubmissions(staffEditor, { formId: stored.id })).length, 2);
  assert.deepEqual(await listSubmissions(staffViewer, { formId: stored.id }), []);
  await assert.rejects(listSubmissions(anon), { code: '42501' });
  assert.equal((await submissionCounts(staffEditor)).get(stored.id)?.total, 2);
  // Paging: older than the newest.
  const [newest] = await listSubmissions(staffEditor, {
    formId: stored.id,
    limit: 1,
  });
  assert.deepEqual(
    (
      await listSubmissions(staffEditor, {
        formId: stored.id,
        before: newest!.createdAt,
      })
    ).map((s) => s.values[0]!.value),
    ['one'],
  );

  await unpublishPage(server, stored.id, editor);
  const refused = await deletePage(server, stored.id, {
    expectedVersion: 1,
    userId: editor,
  });
  assert.deepEqual([refused.ok, !refused.ok && refused.reason], [false, 'in-use']);

  assert.equal(await deleteSubmissions(server, { ids: [newest!.id], userId: editor }), 1);
  assert.equal(await deleteSubmissions(server, { formId: stored.id, userId: editor }), 1);
  assert.equal(
    (
      await deletePage(server, stored.id, {
        expectedVersion: 1,
        userId: editor,
      })
    ).ok,
    true,
  );
});

test('the form shown on the live site is the published version', async () => {
  const stored = storedForm([field('text', { label: 'Name' })], {}, 'versions');
  await publish(stored);
  await savePage(server, formType, { ...stored, title: 'Changed', panels: [] }, { mode: 'draft', expectedVersion: 1, userId: editor });
  const { getLiveForm, getDraftForm } = await import('../src/supabase/forms.ts');
  const live = (await getLiveForm(anon, stored.id)) as PublicForm;
  assert.deepEqual([live.title, live.version, live.items.length], ['Contact', 1, 1]);
  const draft = (await getDraftForm(server, stored.id)) as PublicForm;
  assert.deepEqual([draft.title, draft.version, draft.items.length], ['Changed', 2, 0]);
  assert.equal(await getDraftForm(anon, stored.id), null);
});
