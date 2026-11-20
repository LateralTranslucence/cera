import type { MediaRef } from './fields.ts';

/**
 * Public URL for a media reference. Paths are objects in Cera's `cera-media`
 * bucket, served from `NEXT_PUBLIC_SUPABASE_URL`; absolute URLs and
 * root-relative paths pass through (handy for seeded content before uploads
 * exist). Used by the core panels; exported from `./supabase` for sites.
 */
export function mediaUrl(ref: Pick<MediaRef, 'path'>): string {
  if (/^(https?:)?\/\//.test(ref.path) || ref.path.startsWith('/')) return ref.path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return `${base}/storage/v1/object/public/cera-media/${ref.path.split('/').map(encodeURIComponent).join('/')}`;
}
