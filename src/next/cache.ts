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
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnyContentType } from '../content-type.ts';
import type { IconGlyph, IconLibrary } from '../icons/index.ts';
import type { LoadContext } from '../panel.ts';
import type { SearchQuery, SearchSettings } from '../search/model.ts';
import { createFormResolver, createPageResolver, createSearchResolver, DEFAULT_FORM_ENDPOINT, DEFAULT_SEARCH_ENDPOINT, getLiveForm } from '../supabase/index.ts';

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

export interface LoadContextsOptions {
  contentTypes: readonly AnyContentType[];
  /** Reads live pages: the anonymous (publishable key) client. */
  publicClient: () => SupabaseClient;
  /** Reads working copies in draft-mode preview: the secret-key client, behind draft mode. */
  serviceClient: () => SupabaseClient;
  /** The site's icon sets (see createIconLibrary); `draft` includes the site's own icons' working copies. */
  icons?: (client: SupabaseClient, draft: boolean) => IconLibrary;
}

/**
 * What panels' `load` reads through (linked pages, forms, icons, searches),
 * for the live site and for draft-mode preview. Live reads go through the
 * data cache like live pages (cleared by pagesChanged), so a panel's `load`
 * costs no database round trip on a cached page; preview reads working
 * copies, never cached. Clients are made per read, so `next build` can load
 * this without Supabase settings.
 *
 *   export const loadContextFor = createLoadContexts({ contentTypes, publicClient, serviceClient, icons: iconLibrary });
 *   <Panels … loadContext={loadContextFor(draft)} />
 */
export function createLoadContexts(options: LoadContextsOptions): (draft: boolean) => Pick<LoadContext, 'pages' | 'forms' | 'icons' | 'search' | 'draft'> {
  const { contentTypes, publicClient, serviceClient } = options;
  const linkedPages = cacheLive('linked-pages', (ids: string[]) => createPageResolver(publicClient(), contentTypes, { draft: false }).byIds(ids));
  const form = cacheLive('form', (id: string) => getLiveForm(publicClient(), id));
  // The cache holds plain arrays, so the Map is rebuilt after it.
  const glyphs = cacheLive('icons', async (values: string[]): Promise<IconGlyph[]> => [...(await options.icons!(publicClient(), false).byValues(values)).values()]);
  // Search settings and queries travel as JSON, so they can be cache keys.
  const searchForm = cacheLive('search-form', (settings: string) => createSearchResolver(publicClient(), contentTypes, { draft: false }).describe(JSON.parse(settings) as SearchSettings));
  const searchResults = cacheLive('search-results', (settings: string, query: string) =>
    createSearchResolver(publicClient(), contentTypes, { draft: false }).run(JSON.parse(settings) as SearchSettings, JSON.parse(query) as SearchQuery),
  );

  const live: Pick<LoadContext, 'pages' | 'forms' | 'icons' | 'search' | 'draft'> = {
    pages: { byIds: (ids) => linkedPages([...ids]) },
    forms: { byId: form, endpoint: DEFAULT_FORM_ENDPOINT },
    ...(options.icons && {
      icons: {
        async byValues(values: readonly string[]) {
          const sorted = [...new Set(values)].sort();
          return new Map((await glyphs(sorted)).map((glyph) => [glyph.value, glyph]));
        },
      },
    }),
    search: {
      endpoint: DEFAULT_SEARCH_ENDPOINT,
      describe: (settings) => searchForm(JSON.stringify(settings)),
      run: (settings, query) => searchResults(JSON.stringify(settings), JSON.stringify(query)),
    },
    draft: false,
  };

  return (draft) => {
    if (!draft) return live;
    const client = serviceClient();
    return {
      pages: createPageResolver(client, contentTypes, { draft }),
      forms: createFormResolver(client, { draft }),
      ...(options.icons && { icons: options.icons(client, true) }),
      search: createSearchResolver(client, contentTypes, { draft }),
      draft,
    };
  };
}
