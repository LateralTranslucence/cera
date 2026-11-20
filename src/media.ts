/**
 * Media library types and upload rules, shared by the server helpers in
 * `./supabase` and the admin's media picker.
 *
 * The allowed types match the `cera-media` bucket's `allowed_mime_types`
 * (migration 20261119000000), which Storage enforces on every upload. SVG is
 * left out because it can carry scripts.
 */
import type { MediaRef } from './fields.ts';

export type MediaKind = MediaRef['kind'];

/** Uploadable MIME types, with the file extension Cera stores them under. */
export const MEDIA_TYPES = {
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
  'image/gif': { ext: 'gif', kind: 'image' },
  'image/avif': { ext: 'avif', kind: 'image' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
  'video/webm': { ext: 'webm', kind: 'video' },
} as const satisfies Record<string, { ext: string; kind: MediaKind }>;

export type MediaMimeType = keyof typeof MEDIA_TYPES;

/** Largest upload per kind, in bytes. The bucket's own limit is 50 MiB. */
export const MEDIA_MAX_BYTES = { image: 10 * 1024 * 1024, video: 50 * 1024 * 1024 } as const;

export function isMediaMimeType(type: string): type is MediaMimeType {
  return Object.hasOwn(MEDIA_TYPES, type);
}

/** The `accept` attribute for a file input limited to `kinds`. */
export function mediaAccept(kinds: readonly MediaKind[]): string {
  return Object.entries(MEDIA_TYPES)
    .filter(([, t]) => kinds.includes(t.kind))
    .map(([mime]) => mime)
    .join(',');
}

/** A row of the media library (`cera_media`). Pick one into a field with `toMediaRef`. */
export interface MediaItem {
  id: string;
  path: string;
  kind: MediaKind;
  mimeType?: string;
  alt?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  createdAt?: string;
}

export interface MediaQuery {
  /** Matches the path and alt text. */
  search?: string;
  kinds?: MediaKind[];
  limit?: number;
}

/** What a browser sends before uploading. Nothing here is trusted: the server checks it, and Storage checks it again. */
export interface MediaUploadRequest {
  name: string;
  type: string;
  size: number;
}

/** Where to upload: a one-time signed URL for a path the server chose. */
export interface MediaUploadTicket {
  path: string;
  signedUrl: string;
  token: string;
}

export type MediaUploadPrepared = ({ ok: true } & MediaUploadTicket) | { ok: false; message: string };

/** What a browser sends after uploading. The server reads type and size from Storage, not from here. */
export interface MediaUploadDone {
  path: string;
  alt?: string;
  /** Measured in the browser. Only layout hints, so they aren't verified. */
  width?: number;
  height?: number;
}

export type MediaUploadResult = { ok: true; item: MediaItem } | { ok: false; message: string };

/** The reference a field stores for a library item. */
export function toMediaRef(item: MediaItem): MediaRef {
  return {
    id: item.id,
    path: item.path,
    kind: item.kind,
    ...(item.alt && { alt: item.alt }),
    ...(item.width && { width: item.width }),
    ...(item.height && { height: item.height }),
  };
}
