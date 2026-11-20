// Media uploads and the library: prepare → (browser upload) → finish → listMedia.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import type { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mediaAccept, toMediaRef } from '../src/index.ts';
import { finishMediaUpload, listMedia, mediaPathFor, prepareMediaUpload } from '../src/supabase/index.ts';
import { addUser, createTestDb, fakeSupabase, queryAs, type FakeObject } from './support/db.ts';

let db: PGlite;
let editor: string;
let viewer: string;
let objects: Map<string, FakeObject>;
let server: SupabaseClient;
let anon: SupabaseClient;

const MB = 1024 * 1024;

before(async () => {
  db = await createTestDb();
  editor = await addUser(db, 'editor');
  viewer = await addUser(db, 'viewer');
  objects = new Map();
  server = fakeSupabase(db, 'service_role', {}, objects);
  anon = fakeSupabase(db, 'anon');
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
  const a = mediaPathFor('Sunset over Mars (final).PNG', 'image/png', now);
  assert.match(a, /^2026\/11\/[0-9a-f]{8}-sunset-over-mars-final\.png$/);
  assert.notEqual(a, mediaPathFor('Sunset over Mars (final).PNG', 'image/png', now));
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
  const big = await prepareMediaUpload(server, { name: 'huge.jpg', type: 'image/jpeg', size: 11 * MB });
  assert.equal(big.ok, false);
  if (!big.ok) assert.match(big.message, /11 MB; images can be up to 10 MB/);
  // Videos may be larger than images.
  assert.equal((await prepareMediaUpload(server, { name: 'clip.mp4', type: 'video/mp4', size: 40 * MB })).ok, true);
});

test('prepare needs the secret key: a browser client gets no upload URL', async () => {
  const browser = fakeSupabase(db, 'authenticated', { sub: editor, app_metadata: { cera_role: 'editor' } });
  await assert.rejects(prepareMediaUpload(browser, { name: 'a.png', type: 'image/png', size: 10 }), { name: 'CeraDatabaseError' });
});

test('upload records the file with what Storage reports, and the library lists it', async () => {
  const { path, result } = await upload('Olympus Mons.jpg', 'image/jpeg', 2 * MB, { alt: '  Olympus Mons from orbit ', width: 1600, height: 900 });
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) return;
  assert.deepEqual(
    { ...result.item, id: undefined, createdAt: undefined },
    { id: undefined, path, kind: 'image', mimeType: 'image/jpeg', alt: 'Olympus Mons from orbit', width: 1600, height: 900, sizeBytes: 2 * MB, createdAt: undefined },
  );
  assert.deepEqual(toMediaRef(result.item), { id: result.item.id, path, kind: 'image', alt: 'Olympus Mons from orbit', width: 1600, height: 900 });

  const [row] = await queryAs(db, 'service_role', 'select created_by from public.cera_media where path = $1', [path]);
  assert.equal(row?.created_by, editor);

  // Anyone can read the library (the files are public), newest first.
  const video = await upload('Rover clip.mp4', 'video/mp4', 5 * MB);
  assert.equal(video.result.ok, true);
  const all = await listMedia(anon);
  assert.deepEqual(all.slice(0, 2).map((m) => m.path), [video.path, path]);
  assert.deepEqual((await listMedia(anon, { kinds: ['video'] })).map((m) => m.path), [video.path]);
  assert.deepEqual((await listMedia(anon, { search: 'ORBIT' })).map((m) => m.path), [path]);
  assert.deepEqual((await listMedia(anon, { search: 'olympus mons' })).map((m) => m.path), [path]);
  // LIKE wildcards in a search are literal.
  assert.deepEqual(await listMedia(anon, { search: '%' }), []);
  assert.equal((await listMedia(anon, { limit: 1 })).length, 1);
});

test('finish trusts Storage, not the browser: a disallowed object is deleted', async () => {
  const sneaky = await upload('photo.png', 'image/png', 1000, { stored: { contentType: 'text/html' } });
  assert.equal(sneaky.result.ok, false);
  assert.equal(objects.has(sneaky.path), false);

  const swollen = await upload('photo.png', 'image/png', 1000, { stored: { size: 30 * MB } });
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
  assert.equal(Number(bucket?.file_size_limit), 50 * MB);
  assert.deepEqual([...(bucket?.allowed_mime_types ?? [])].sort(), mediaAccept(['image', 'video']).split(',').sort());
  assert.equal(mediaAccept(['image']).includes('video/'), false);
});
