// Media uploads and the library: prepare → (browser upload) → finish → listMedia.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mediaAccept, toMediaRef } from '../src/index.ts';
import { cleanUpUploads, deleteMedia, finishMediaUpload, listMedia, mediaPathFor, mediaUsage, prepareMediaUpload, replaceMedia, updateMedia } from '../src/supabase/index.ts';
import { addUser, createTestDb, fakeSupabase, queryAs, type FakeObject } from './support/db.ts';

let db: PGlite;
let editor: string;
let viewer: string;
let objects: Map<string, FakeObject>;
let server: SupabaseClient;
let anonymous: SupabaseClient;

const MEGABYTE = 1024 * 1024;

before(async () => {
  db = await createTestDb();
  editor = await addUser(db, 'editor');
  viewer = await addUser(db, 'viewer');
  objects = new Map();
  server = fakeSupabase(db, 'service_role', {}, objects);
  anonymous = fakeSupabase(db, 'anon');
});

/** Prepares, "uploads" (what Storage would hold afterward), and finishes. */
async function upload(name: string, type: string, size: number, extra: { alt?: string; width?: number; height?: number; stored?: Partial<FakeObject> } = {}) {
  const ticket = await prepareMediaUpload(server, { name, type, size });
  assert.equal(ticket.ok, true, JSON.stringify(ticket));
  if (!ticket.ok) throw new Error('unreachable');
  objects.set(ticket.path, { contentType: type, size, ...extra.stored });
  return { path: ticket.path, result: await finishMediaUpload(server, { path: ticket.path, alt: extra.alt, width: extra.width, height: extra.height }, { userId: editor }) };
}

test('paths: dated, unique, slugged, extension from the type (never the file name)', () => {
  const now = new Date(Date.UTC(2026, 10, 19));
  const mediaPath = mediaPathFor('Sunset over Mars (final).PNG', 'image/png', now);
  assert.match(mediaPath, /^2026\/11\/[0-9a-f]{8}-sunset-over-mars-final\.png$/);
  assert.notEqual(mediaPath, mediaPathFor('Sunset over Mars (final).PNG', 'image/png', now));
  assert.match(mediaPathFor('evil.html', 'image/jpeg', now), /-evil\.jpg$/);
  assert.match(mediaPathFor('Été à Paris.jpeg', 'image/jpeg', now), /-ete-a-paris\.jpg$/);
  assert.match(mediaPathFor('🚀.webp', 'image/webp', now), /-file\.webp$/);
  assert.match(mediaPathFor('../../etc/passwd', 'image/gif', now), /^2026\/11\/[0-9a-f]{8}-passwd\.gif$/);
});

test('prepare refuses types and sizes outside the rules', async () => {
  const svg = await prepareMediaUpload(server, { name: 'logo.svg', type: 'image/svg+xml', size: 1000 });
  assert.equal(svg.ok, false);
  if (!svg.ok) assert.match(svg.message, /can’t be uploaded/);
  assert.equal((await prepareMediaUpload(server, { name: 'page.html', type: 'text/html', size: 1000 })).ok, false);
  assert.equal((await prepareMediaUpload(server, { name: 'empty.png', type: 'image/png', size: 0 })).ok, false);
  const big = await prepareMediaUpload(server, { name: 'huge.jpg', type: 'image/jpeg', size: 11 * MEGABYTE });
  assert.equal(big.ok, false);
  if (!big.ok) assert.match(big.message, /11 MB; images can be up to 10 MB/);
  // Videos may be larger than images.
  assert.equal((await prepareMediaUpload(server, { name: 'clip.mp4', type: 'video/mp4', size: 40 * MEGABYTE })).ok, true);
});

test('prepare needs the secret key: a browser client gets no upload URL', async () => {
  const browser = fakeSupabase(db, 'authenticated', { sub: editor, app_metadata: { cera_role: 'editor' } });
  await assert.rejects(prepareMediaUpload(browser, { name: 'a.png', type: 'image/png', size: 10 }), { name: 'CeraDatabaseError' });
});

test('upload records the file with what Storage reports, and the library lists it', async () => {
  const { path, result } = await upload('Olympus Mons.jpg', 'image/jpeg', 2 * MEGABYTE, { alt: '  Olympus Mons from orbit ', width: 1600, height: 900 });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) return;
  assert.deepEqual(
    { ...result.item, id: undefined, createdAt: undefined },
    { id: undefined, path, kind: 'image', mimeType: 'image/jpeg', alt: 'Olympus Mons from orbit', width: 1600, height: 900, sizeBytes: 2 * MEGABYTE, createdAt: undefined },
  );
  assert.deepEqual(toMediaRef(result.item), { id: result.item.id, path, kind: 'image', alt: 'Olympus Mons from orbit', width: 1600, height: 900 });

  const [row] = await queryAs(db, 'service_role', 'select created_by from public.cera_media where path = $1', [path]);
  assert.equal(row?.created_by, editor);

  // Anyone can read the library (the files are public), newest first.
  const video = await upload('Rover clip.mp4', 'video/mp4', 5 * MEGABYTE);
  assert.equal(video.result.ok, true);
  const all = await listMedia(anonymous);
  assert.deepEqual(all.slice(0, 2).map((media) => media.path), [video.path, path]);
  assert.deepEqual((await listMedia(anonymous, { kinds: ['video'] })).map((media) => media.path), [video.path]);
  assert.deepEqual((await listMedia(anonymous, { search: 'ORBIT' })).map((media) => media.path), [path]);
  assert.deepEqual((await listMedia(anonymous, { search: 'olympus mons' })).map((media) => media.path), [path]);
  // LIKE wildcards in a search are literal.
  assert.deepEqual(await listMedia(anonymous, { search: '%' }), []);
  assert.equal((await listMedia(anonymous, { limit: 1 })).length, 1);
});

test('finish trusts Storage, not the browser: a disallowed object is deleted', async () => {
  const sneaky = await upload('photo.png', 'image/png', 1000, { stored: { contentType: 'text/html' } });
  assert.equal(sneaky.result.ok, false);
  assert.equal(objects.has(sneaky.path), false);

  const swollen = await upload('photo.png', 'image/png', 1000, { stored: { size: 30 * MEGABYTE } });
  assert.equal(swollen.result.ok, false);
  assert.equal(objects.has(swollen.path), false);

  const [count] = await queryAs<{ n: number }>(db, 'service_role', 'select count(*)::int as n from public.cera_media where path = any($1::text[])', [[sneaky.path, swollen.path]]);
  assert.equal(count?.n, 0);
});

test('finish refuses missing objects, bad paths, odd dimensions and non-editors', async () => {
  const missing = await finishMediaUpload(server, { path: '2026/11/00000000-nothing.png' }, { userId: editor });
  assert.equal(missing.ok, false);
  for (const path of ['../secret.png', '/abs.png', 'Upper.png', '2026/11/../x.png']) {
    assert.equal((await finishMediaUpload(server, { path }, { userId: editor })).ok, false, path);
  }

  const odd = await upload('odd.webp', 'image/webp', 1000, { width: -5, height: 1.5 });
  assert.equal(odd.result.ok, true);
  if (odd.result.ok) assert.deepEqual([odd.result.item.width, odd.result.item.height], [undefined, undefined]);

  const ticket = await prepareMediaUpload(server, { name: 'v.png', type: 'image/png', size: 10 });
  if (!ticket.ok) throw new Error('unreachable');
  objects.set(ticket.path, { contentType: 'image/png', size: 10 });
  const denied = await finishMediaUpload(server, { path: ticket.path }, { userId: viewer });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.match(denied.message, /can’t upload/);
});

test('browsers can read the media table but not write to it', async () => {
  const claims = { sub: editor, app_metadata: { cera_role: 'editor' } };
  await assert.rejects(
    queryAs(db, 'authenticated', `insert into public.cera_media (path) values ('2026/11/x.png')`, [], claims),
    /permission denied/,
  );
  await assert.rejects(
    queryAs(db, 'authenticated', `select public.cera_add_media('{"path":"2026/11/x.png"}'::jsonb, $1)`, [editor], claims),
    /permission denied/,
  );
});

test('the bucket enforces the same types, without SVG', async () => {
  const [bucket] = await queryAs<{ allowed_mime_types: string[]; file_size_limit: number }>(
    db,
    'service_role',
    `select allowed_mime_types, file_size_limit from storage.buckets where id = 'cera-media'`,
  );
  assert.equal(Number(bucket?.file_size_limit), 50 * MEGABYTE);
  assert.deepEqual([...(bucket?.allowed_mime_types ?? [])].sort(), mediaAccept(['image', 'video']).split(',').sort());
  assert.equal(mediaAccept(['image']).includes('video/'), false);
});

/** Saves a page straight through cera_save_page, with `panels` as given. */
async function savePanels(id: string, slug: string, panels: unknown[], options: { publish: boolean; version: number }) {
  const { error } = await server.rpc('cera_save_page', {
    p_page: { id, contentType: 'landing_page', slug, title: `Page ${slug}`, boxes: {}, panels },
    p_expected_version: options.version,
    p_publish: options.publish,
    p_user: editor,
  });
  assert.equal(error, null, JSON.stringify(error));
}

async function uploaded(name: string) {
  const { result } = await upload(name, 'image/png', 1000);
  if (!result.ok) throw new Error(result.message);
  return result.item;
}

test('update changes only the library alt text, and checks the role', async () => {
  const item = await uploaded('crater.png');
  const changed = await updateMedia(server, { id: item.id, alt: '  Gale crater  ' }, { userId: editor });
  assert.equal(changed.ok, true, JSON.stringify(changed));
  if (changed.ok) assert.deepEqual(changed.item, { ...item, alt: 'Gale crater' });
  assert.deepEqual((await listMedia(anonymous, { search: 'gale crater' })).map((media) => media.id), [item.id]);

  const cleared = await updateMedia(server, { id: item.id, alt: '   ' }, { userId: editor });
  assert.equal(cleared.ok && cleared.item.alt, undefined);

  const denied = await updateMedia(server, { id: item.id, alt: 'x' }, { userId: viewer });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.match(denied.message, /can’t change/);
  const gone = await updateMedia(server, { id: crypto.randomUUID(), alt: 'x' }, { userId: editor });
  assert.equal(gone.ok, false);
  if (!gone.ok) assert.match(gone.message, /isn’t in the library/);
  assert.equal((await updateMedia(server, { id: 'not-a-uuid', alt: 'x' }, { userId: editor })).ok, false);
});

test('usage finds a file in working copies and live versions, fields and rich text alike', async () => {
  const item = await uploaded('dunes.png');
  const other = await uploaded('dunes-2.png');
  const staff = fakeSupabase(db, 'authenticated', { sub: viewer, app_metadata: { cera_role: 'viewer' } });
  const pageA = crypto.randomUUID();
  const pageB = crypto.randomUUID();
  assert.deepEqual(await mediaUsage(staff, item.path), []);

  // A draft that uses it in a field.
  await savePanels(pageA, 'usage-a', [{ id: 'p1', type: 'cera/featured-media', v: 1, data: { media: { id: item.id, path: item.path, kind: 'image' } } }], { publish: false, version: 0 });
  assert.deepEqual(await mediaUsage(staff, item.path), [{ id: pageA, title: 'Page usage-a', slug: 'usage-a', contentType: 'landing_page', draft: true, live: false }]);
  assert.deepEqual(await mediaUsage(staff, other.path), []); // a similarly named file doesn't count

  // Published: live too. Then a draft without it: live only.
  await savePanels(pageA, 'usage-a', [{ id: 'p1', type: 'cera/featured-media', v: 1, data: { media: { id: item.id, path: item.path, kind: 'image' } } }], { publish: true, version: 1 });
  assert.deepEqual((await mediaUsage(staff, item.path)).map((usage) => [usage.draft, usage.live]), [[true, true]]);
  await savePanels(pageA, 'usage-a', [], { publish: false, version: 2 });
  assert.deepEqual((await mediaUsage(staff, item.path)).map((usage) => [usage.draft, usage.live]), [[false, true]]);

  // An image in rich text counts.
  await savePanels(pageB, 'usage-b', [{ id: 'p1', type: 'cera/text', v: 1, data: { copy: `<p><img src="https://x.supabase.co/storage/v1/object/public/cera-media/${item.path}"></p>` } }], { publish: false, version: 0 });
  assert.deepEqual((await mediaUsage(staff, item.path)).map((usage) => usage.slug), ['usage-a', 'usage-b']);
  assert.deepEqual(await mediaUsage(staff, ''), []);
});

test('delete refuses a file a page uses, and removes an unused one from the library and Storage', async () => {
  const used = await uploaded('used.png');
  const page = crypto.randomUUID();
  await savePanels(page, 'delete-test', [{ id: 'p1', type: 'cera/gallery', v: 1, data: { gallery: [{ id: used.id, path: used.path, kind: 'image' }] } }], { publish: true, version: 0 });

  const refused = await deleteMedia(server, used.id, { userId: editor });
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.match(refused.message, /A page uses this file/);
    assert.deepEqual(refused.usedBy?.map((usage) => [usage.slug, usage.draft, usage.live]), [['delete-test', true, true]]);
  }
  assert.equal(objects.has(used.path), true);

  const unused = await uploaded('unused.png');
  assert.equal((await deleteMedia(server, unused.id, { userId: viewer })).ok, false);
  assert.equal(objects.has(unused.path), true);
  assert.deepEqual(await deleteMedia(server, unused.id, { userId: editor }), { ok: true });
  assert.equal(objects.has(unused.path), false);
  assert.deepEqual((await listMedia(anonymous, { search: 'unused' })).map((media) => media.id), []);
  const again = await deleteMedia(server, unused.id, { userId: editor });
  assert.equal(again.ok, false);
  if (!again.ok) assert.match(again.message, /isn’t in the library/);
});

test('browsers can’t edit or delete media, and only signed-in users can check usage', async () => {
  const item = await uploaded('locked.png');
  const claims = { sub: editor, app_metadata: { cera_role: 'editor' } };
  await assert.rejects(queryAs(db, 'authenticated', `select public.cera_update_media($1, '{"alt":"x"}'::jsonb, $2)`, [item.id, editor], claims), /permission denied/);
  await assert.rejects(queryAs(db, 'authenticated', 'select public.cera_delete_media($1, $2)', [item.id, editor], claims), /permission denied/);
  await assert.rejects(queryAs(db, 'authenticated', `update public.cera_media set alt = 'x' where id = $1`, [item.id], claims), /permission denied/);
  await assert.rejects(queryAs(db, 'anon', 'select public.cera_media_usage($1)', [item.path]), /permission denied/);
});

test('the library pages past its newest files, and lists the files no page uses', async () => {
  const first = await uploaded('paging-1.png');
  await db.query(`update public.cera_media set created_at = now() - interval '1 hour' where id = $1`, [first.id]);
  const second = await uploaded('paging-2.png');
  const [newest] = await listMedia(anonymous, { search: 'paging', limit: 1 });
  assert.equal(newest?.id, second.id);
  assert.deepEqual((await listMedia(anonymous, { search: 'paging', limit: 1, before: newest!.createdAt })).map((media) => media.id), [first.id]);

  const staff = fakeSupabase(db, 'authenticated', { sub: viewer, app_metadata: { cera_role: 'viewer' } });
  await savePanels(crypto.randomUUID(), 'paging-page', [{ id: 'p1', type: 'cera/featured-media', v: 1, data: { media: { id: first.id, path: first.path, kind: 'image' } } }], { publish: false, version: 0 });
  assert.deepEqual((await listMedia(staff, { search: 'paging', unused: true })).map((media) => media.id), [second.id]);
});

test('cleanup removes old files with no library row that no page uses, and nothing else', async () => {
  const library = await uploaded('kept.png');
  const old = (name: string) => db.query(`insert into storage.objects (bucket_id, name, created_at) values ('cera-media', $1, now() - interval '2 days')`, [name]);
  for (const name of ['2026/11/aaaa0001-abandoned.png', '2026/11/aaaa0002-in-a-page.png', library.path]) {
    await old(name);
    objects.set(name, { contentType: 'image/png', size: 10 });
  }
  await db.query(`insert into storage.objects (bucket_id, name) values ('cera-media', '2026/11/aaaa0003-just-now.png')`);
  objects.set('2026/11/aaaa0003-just-now.png', { contentType: 'image/png', size: 10 });
  // A page still points at a file with no library row (it was replaced): it stays.
  await savePanels(crypto.randomUUID(), 'cleanup-page', [{ id: 'p1', type: 'cera/text', v: 1, data: { copy: '<p><img src="/x/2026/11/aaaa0002-in-a-page.png"></p>' } }], { publish: false, version: 0 });

  assert.deepEqual(await cleanUpUploads(server), ['2026/11/aaaa0001-abandoned.png']);
  assert.deepEqual(['2026/11/aaaa0002-in-a-page.png', '2026/11/aaaa0003-just-now.png', library.path].map((path) => objects.has(path)), [true, true, true]);
  // Only the server may look for them.
  await assert.rejects(cleanUpUploads(anonymous));
});

test('replace points every page that uses a file at the new one, live versions included', async () => {
  const item = await uploaded('before.png');
  const page = crypto.randomUUID();
  const reference = { id: item.id, path: item.path, kind: 'image', alt: 'Our own words', width: 10, height: 10 };
  const panels = [
    { id: 'p1', type: 'cera/featured-media', v: 1, data: { media: reference } },
    { id: 'p2', type: 'cera/text', v: 1, data: { copy: `<p><img src="https://x.supabase.co/storage/v1/object/public/cera-media/${item.path}"></p>` } },
  ];
  await savePanels(page, 'replace-page', panels, { publish: true, version: 0 });

  const ticket = await prepareMediaUpload(server, { name: 'after.webp', type: 'image/webp', size: 2000 });
  if (!ticket.ok) throw new Error(ticket.message);
  objects.set(ticket.path, { contentType: 'image/webp', size: 2000 });
  const replaced = await replaceMedia(server, { id: item.id, path: ticket.path, width: 1200, height: 800 }, { userId: editor });
  assert.equal(replaced.ok, true, JSON.stringify(replaced));
  if (!replaced.ok) return;
  assert.deepEqual([replaced.item.id, replaced.item.path, replaced.item.mimeType, replaced.item.width, replaced.pages], [item.id, ticket.path, 'image/webp', 1200, 1]);

  for (const table of ['cera_pages where id = $1', 'cera_page_revisions where page_id = $1 and is_published']) {
    const [row] = await queryAs<{ panels: Array<{ data: Record<string, unknown> }> }>(db, 'service_role', `select panels from public.${table}`, [page]);
    assert.deepEqual(row?.panels[0]?.data.media, { ...reference, path: ticket.path, width: 1200, height: 800 }, table);
    assert.match(String(row?.panels[1]?.data.copy), new RegExp(ticket.path));
    assert.doesNotMatch(String(row?.panels[1]?.data.copy), new RegExp(item.path));
  }
  // The old file stays in Storage until cleanup finds nothing using it.
  assert.equal(objects.has(item.path), true);

  const video = await prepareMediaUpload(server, { name: 'clip.mp4', type: 'video/mp4', size: 3000 });
  if (!video.ok) throw new Error(video.message);
  objects.set(video.path, { contentType: 'video/mp4', size: 3000 });
  const mismatch = await replaceMedia(server, { id: item.id, path: video.path }, { userId: editor });
  assert.deepEqual(mismatch, { ok: false, message: 'Replace an image with an image, and a video with a video.' });
  assert.equal(objects.has(video.path), false);
  assert.equal((await replaceMedia(server, { id: item.id, path: ticket.path }, { userId: viewer })).ok, false);
});
