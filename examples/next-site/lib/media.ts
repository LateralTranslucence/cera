import type { MediaRef } from '@lateraltranslucence/cera';

/**
 * Public URL for a media reference. Paths are objects in the `cera-media`
 * bucket; absolute URLs and root-relative paths pass through (handy for
 * seeded content before uploads exist).
 */
export function mediaUrl(ref: Pick<MediaRef, 'path'>): string {
  if (/^(https?:)?\/\//.test(ref.path) || ref.path.startsWith('/')) return ref.path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  return `${base}/storage/v1/object/public/cera-media/${ref.path.split('/').map(encodeURIComponent).join('/')}`;
}
