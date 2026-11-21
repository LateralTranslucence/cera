/**
 * Media uploads and the media library.
 *
 * An upload takes three steps, so large files never pass through the app
 * server (hosts like Vercel cap request bodies at a few MB):
 *
 *   1. prepareMediaUpload (server, secret-key client): checks the type and
 *      size the browser claims, picks the object path, and returns a
 *      one-time signed upload URL for that path.
 *   2. The browser PUTs the file to that URL (`uploadMedia` in ./admin does
 *      all three steps). Storage enforces the bucket's own type and size
 *      limits whatever the browser claims.
 *   3. finishMediaUpload (server, secret-key client): reads the stored
 *      object's real type and size from Storage, deletes it if they aren't
 *      allowed, and records it with cera_add_media, which re-checks the
 *      user's role.
 *
 * Check the user's role before step 1 too (the example site's actions use
 * requireStaff('editor')).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  formatBytes,
  isMediaMimeType,
  MEDIA_MAX_BYTES,
  MEDIA_TYPES,
  type MediaDeleteResult,
  type MediaItem,
  type MediaKind,
  type MediaQuery,
  type MediaUploadDone,
  type MediaUploadPrepared,
  type MediaUploadRequest,
  type MediaUploadResult,
  type MediaUpdate,
  type MediaUse,
} from '../media.ts';
import { fail } from './errors.ts';

export const MEDIA_BUCKET = 'cera-media';

const PATH = /^[a-z0-9][a-z0-9/._-]*$/;
const MAX_DIMENSION = 20_000;
const MAX_ALT = 500;

function tooLarge(kind: MediaKind, size: number): string | null {
  const max = kind === 'video' ? MEDIA_MAX_BYTES.video : MEDIA_MAX_BYTES.image;
  return size > max ? `That file is ${formatBytes(size)}; ${kind === 'video' ? 'videos' : 'images'} can be up to ${formatBytes(max)}.` : null;
}

const TYPE_LIST = 'JPEG, PNG, WebP, GIF, AVIF, MP4 or WebM';

/**
 * The object path for an upload: `2026/11/1a2b3c4d-sunset-over-mars.jpg`. The
 * extension comes from the checked type, never from the file name, and the
 * random part keeps names unique (uploads are never overwritten).
 */
export function mediaPathFor(name: string, type: keyof typeof MEDIA_TYPES, now = new Date()): string {
  // Only the file name: browsers send no folders, but other clients might.
  const stem = (name.split(/[\\/]/).pop() ?? '').replace(/\.[^.]*$/, '');
  const slug =
    stem
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'file';
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return `${now.getUTCFullYear()}/${month}/${id}-${slug}.${MEDIA_TYPES[type].ext}`;
}

/** Step 1. `service` must use the secret key: browsers can't create upload URLs. */
export async function prepareMediaUpload(service: SupabaseClient, request: MediaUploadRequest): Promise<MediaUploadPrepared> {
  const type = String(request?.type ?? '');
  const size = Number(request?.size);
  if (!isMediaMimeType(type)) return { ok: false, message: `That file type can’t be uploaded. Use ${TYPE_LIST}.` };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, message: 'That file is empty.' };
  const big = tooLarge(MEDIA_TYPES[type].kind, size);
  if (big) return { ok: false, message: big };

  const path = mediaPathFor(String(request.name ?? ''), type);
  const { data, error } = await service.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) fail(error ?? { message: 'No upload URL returned.' });
  return { ok: true, path: data!.path, signedUrl: data!.signedUrl, token: data!.token };
}

const dimension = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_DIMENSION ? value : undefined;

/** Step 3. `service` must use the secret key; `userId` must come from a verified session. */
export async function finishMediaUpload(
  service: SupabaseClient,
  done: MediaUploadDone,
  options: { userId: string },
): Promise<MediaUploadResult> {
  const path = String(done?.path ?? '');
  if (!PATH.test(path) || path.includes('..')) return { ok: false, message: 'That upload path isn’t valid.' };

  const bucket = service.storage.from(MEDIA_BUCKET);
  const details = await bucket.info(path);
  if (details.error || !details.data) return { ok: false, message: 'The upload didn’t arrive. Try again.' };

  // Storage enforces the bucket's limits, but check what actually arrived.
  const type = String(details.data.contentType ?? '').split(';')[0]!.trim();
  const size = Number(details.data.size ?? 0);
  const problem = !isMediaMimeType(type) ? `That file type can’t be uploaded. Use ${TYPE_LIST}.` : tooLarge(MEDIA_TYPES[type].kind, size);
  if (problem) {
    await bucket.remove([path]);
    return { ok: false, message: problem };
  }

  const alt = typeof done.alt === 'string' ? done.alt.trim().slice(0, MAX_ALT) : '';
  const { data, error } = await service.rpc('cera_add_media', {
    p_media: {
      path,
      kind: MEDIA_TYPES[type as keyof typeof MEDIA_TYPES].kind,
      mimeType: type,
      alt,
      width: dimension(done.width),
      height: dimension(done.height),
      sizeBytes: size,
    },
    p_user: options.userId,
  });
  if (error) {
    if (error.code === '42501') return { ok: false, message: 'Your account can’t upload media.' };
    if (error.code === '23505') return { ok: false, message: 'That upload is already in the library.' };
    fail(error);
  }
  return { ok: true, item: toItem(data as Record<string, unknown>) };
}

const ROW_COLUMNS = 'id, path, kind, mime_type, alt, width, height, size_bytes, created_at';

/** The media library, newest first. Any client can read it (the files are public). */
export async function listMedia(client: SupabaseClient, query: MediaQuery = {}): Promise<MediaItem[]> {
  const limit = Math.min(Math.max(Math.trunc(query.limit ?? 60), 1), 200);
  let request = client.from('cera_media').select(ROW_COLUMNS);
  if (query.kinds?.length) request = request.in('kind', query.kinds);
  const search = (query.search ?? '').trim().toLowerCase();
  if (search) request = request.ilike('search', `%${search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`);
  const { data, error } = await request.order('created_at', { ascending: false }).limit(limit);
  if (error) fail(error);
  return (data ?? []).map((row) => toItem(row as Record<string, unknown>));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Changes a file's library alt text: the default for new uses. Pages that
 * already use the file keep their own alt text. `service` must use the
 * secret key; `userId` must come from a verified session.
 */
export async function updateMedia(service: SupabaseClient, update: MediaUpdate, options: { userId: string }): Promise<MediaUploadResult> {
  const id = String(update?.id ?? '');
  if (!UUID.test(id)) return { ok: false, message: 'That file isn’t in the library.' };
  const alt = typeof update.alt === 'string' ? update.alt.trim().slice(0, MAX_ALT) : '';
  const { data, error } = await service.rpc('cera_update_media', { p_id: id, p_media: { alt }, p_user: options.userId });
  if (error) {
    if (error.code === '42501') return { ok: false, message: 'Your account can’t change media.' };
    if (error.code === 'CE404') return { ok: false, message: 'That file isn’t in the library any more.' };
    fail(error);
  }
  return { ok: true, item: toItem(data as Record<string, unknown>) };
}

/**
 * The pages that use a file, by title. Pass the signed-in user's client:
 * row-level security decides which pages they can see.
 */
export async function mediaUsage(client: SupabaseClient, path: string): Promise<MediaUse[]> {
  if (!PATH.test(path)) return [];
  const { data, error } = await client.rpc('cera_media_usage', { p_path: path });
  if (error) fail(error);
  return ((data as Array<Record<string, unknown>> | null) ?? []).map((usage) => ({
    id: String(usage.id),
    title: String(usage.title ?? ''),
    slug: String(usage.slug ?? ''),
    contentType: String(usage.contentType ?? ''),
    draft: usage.draft === true,
    live: usage.live === true,
  }));
}

/**
 * Deletes a file from the library and from Storage, unless a page uses it
 * (its working copy or live version; see the migration for why older
 * revisions aren't checked). `service` must use the secret key; `userId`
 * must come from a verified session.
 *
 * The library row goes first, in a transaction that re-checks the role and
 * the usage. If removing the object from Storage then fails, the file stays
 * reachable at its old URL but is no longer in the library.
 */
export async function deleteMedia(service: SupabaseClient, id: string, options: { userId: string }): Promise<MediaDeleteResult> {
  if (!UUID.test(String(id ?? ''))) return { ok: false, message: 'That file isn’t in the library.' };
  const { data, error } = await service.rpc('cera_delete_media', { p_id: id, p_user: options.userId });
  if (error) {
    if (error.code === '42501') return { ok: false, message: 'Your account can’t delete media.' };
    if (error.code === 'CE404') return { ok: false, message: 'That file isn’t in the library any more.' };
    if (error.code === 'CE409') {
      const { data: row } = await service.from('cera_media').select('path').eq('id', id).maybeSingle();
      const usedBy = row ? await mediaUsage(service, String((row as { path: string }).path)) : [];
      return { ok: false, message: 'A page uses this file. Remove it from those pages first.', usedBy };
    }
    fail(error);
  }
  const path = String((data as { path?: string } | null)?.path ?? '');
  if (path) await service.storage.from(MEDIA_BUCKET).remove([path]);
  return { ok: true };
}

function toItem(row: Record<string, unknown>): MediaItem {
  const asText = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined);
  const asNumber = (value: unknown) => (value === null || value === undefined || value === '' ? undefined : Number(value));
  return {
    id: String(row.id),
    path: String(row.path),
    kind: (row.kind as MediaKind) ?? 'image',
    mimeType: asText(row.mimeType ?? row.mime_type),
    alt: asText(row.alt),
    width: asNumber(row.width),
    height: asNumber(row.height),
    sizeBytes: asNumber(row.sizeBytes ?? row.size_bytes),
    createdAt: asText(row.createdAt ?? row.created_at),
  };
}
