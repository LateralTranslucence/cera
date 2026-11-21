/**
 * `@lateraltranslucence/cera/next/cache` — caching live page reads.
 *
 * Pages still render per request (draft mode needs the request), but the
 * database reads behind the live site go through Next's data cache, tagged
 * `cera:pages`:
 *
 *   const getLive = cacheLive('published-page', (slug: string) => getPublishedPage(publicClient(), contentType, slug));
 *
 * After a publish or unpublish, call `pagesChanged()` from the Server Action
 * that did it: the next request reads fresh data (Next's `updateTag`, built
 * for read-your-own-writes). Everything is invalidated at once, because a
 * change to one page can show on others (Featured Post, Posts).
 *
 * Changes made outside the admin (a seed script, SQL) show within
 * `revalidate` seconds, 300 by default.
 *
 * Only cache reads that are the same for every visitor: never the draft
 * preview, never anything read with the user's session.
 *
 * This uses `unstable_cache`, the data cache that works without Next 16's
 * Cache Components. Moving to `'use cache'` is a later step.
 */
import { unstable_cache, updateTag } from 'next/cache';

export const CERA_PAGES_TAG = 'cera:pages';
export const DEFAULT_REVALIDATE_SECONDS = 300;

/** Wraps a live (published-only) read in Next's data cache. Its arguments become part of the cache key. */
export function cacheLive<Args extends unknown[], Result>(name: string, read: (...callArguments: Args) => Promise<Result>, options: { revalidate?: number } = {}): (...callArguments: Args) => Promise<Result> {
  return unstable_cache(read, ['cera', name], { tags: [CERA_PAGES_TAG], revalidate: options.revalidate ?? DEFAULT_REVALIDATE_SECONDS });
}

/** Call from a Server Action after publishing or unpublishing: the next request reads fresh pages. */
export function pagesChanged(): void {
  updateTag(CERA_PAGES_TAG);
}
