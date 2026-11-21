import 'server-only';
import { cache } from 'react';
import { draftMode } from 'next/headers';
import { createFormResolver, createPageResolver, createSearchResolver, DEFAULT_FORM_ENDPOINT, DEFAULT_SEARCH_ENDPOINT, findDraftPage, findPublishedPage, getLiveForm } from '@lateraltranslucence/cera/supabase';
import { cacheLive } from '@lateraltranslucence/cera/next/cache';
import type { LoadContext, PageIssue, SearchResolver } from '@lateraltranslucence/cera';
import type { SearchQuery, SearchSettings } from '@lateraltranslucence/cera/panels';
import { contentTypes, routedTypes } from '../cera/index.ts';
import { iconLibrary, liveIcons } from './icons.ts';
import { publicClient, serviceClient } from './supabase.ts';

function logIssue(slug: string) {
  return (issue: PageIssue) =>
    console.warn(`cera: [${slug}] ${issue.severity} ${issue.code} at ${issue.path.join('.')}: ${issue.message}`);
}

/**
 * Live reads go through Next's data cache (tag `cera:pages`); publishing in
 * the admin clears it (see `pagesChanged` in app/admin/actions.ts). Issues are
 * logged when the page is actually read, not on every cache hit.
 */
const publishedPage = cacheLive('routed-page', (slug: string) => findPublishedPage(publicClient(), routedTypes, slug, { onIssue: logIssue(slug) }));
// Clients are made per read, not when this module loads: `next build` loads
// it without Supabase settings (CI has none).
const liveLinkedPages = cacheLive('linked-pages', (ids: string[]) =>
  createPageResolver(publicClient(), contentTypes, { draft: false }).byIds(ids),
);
const liveForm = cacheLive('form', (id: string) => getLiveForm(publicClient(), id));
// Search panels: their filter form and first results, cached like pages. The
// cache keys on the settings and query, so they travel as JSON.
const liveSearchForm = cacheLive('search-form', (settings: string) =>
  createSearchResolver(publicClient(), contentTypes, { draft: false }).describe(JSON.parse(settings) as SearchSettings),
);
const liveSearchResults = cacheLive('search-results', (settings: string, query: string) =>
  createSearchResolver(publicClient(), contentTypes, { draft: false }).run(JSON.parse(settings) as SearchSettings, JSON.parse(query) as SearchQuery),
);
const liveSearch: SearchResolver = {
  endpoint: DEFAULT_SEARCH_ENDPOINT,
  describe: (settings) => liveSearchForm(JSON.stringify(settings)),
  run: (settings, query) => liveSearchResults(JSON.stringify(settings), JSON.stringify(query)),
};

/**
 * Loads the page at /[slug] for rendering, a landing page or a simple page
 * (they share addresses): the live revision normally (cached), the working
 * copy in draft mode (never cached). Returns `null` when there's nothing to
 * show (missing, or hidden outside draft mode). `type` says which content
 * type it is. Deduplicated per request, so `generateMetadata` and the page
 * share one read.
 */
export const loadPage = cache(async (slug: string) => {
  const { isEnabled: draft } = await draftMode();
  const found = draft ? await findDraftPage(serviceClient(), routedTypes, slug, { onIssue: logIssue(slug) }) : await publishedPage(slug);

  if (!found) return null;
  const contentType = routedTypes.find((routedType) => routedType.name === found.type)!;
  if (!draft && contentType.hidden?.(found.page as never)) return null;
  return { ...found, draft };
});

/**
 * How panels' `load` looks up linked pages, forms, icons and searches: published ones
 * for visitors (cached, like the pages themselves), working copies in
 * draft-mode preview (behind the draft-mode cookie, so the secret key is safe
 * to use there). Forms post to app/api/cera/forms.
 */
export function loadContextFor(draft: boolean): Pick<LoadContext, 'pages' | 'forms' | 'icons' | 'search' | 'draft'> {
  if (draft) {
    const client = serviceClient();
    return {
      pages: createPageResolver(client, contentTypes, { draft }),
      forms: createFormResolver(client, { draft }),
      icons: iconLibrary(client, true),
      search: createSearchResolver(client, contentTypes, { draft }),
      draft,
    };
  }
  return { pages: { byIds: (ids) => liveLinkedPages([...ids]) }, forms: { byId: liveForm, endpoint: DEFAULT_FORM_ENDPOINT }, icons: liveIcons, search: liveSearch, draft };
}
