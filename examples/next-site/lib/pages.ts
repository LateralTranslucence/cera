import 'server-only';
import { cache } from 'react';
import { draftMode } from 'next/headers';
import { findDraftPage, findPublishedPage, getRevisionPage } from '@lateraltranslucence/cera/supabase';
import { previewedVersion } from '@lateraltranslucence/cera/next';
import { cacheLive, createLoadContexts } from '@lateraltranslucence/cera/next/cache';
import { matchRoute, type PageIssue } from '@lateraltranslucence/cera';
import { contentTypes } from '../cera/index.ts';
import { views } from '../cera/views.ts';
import { iconLibrary } from './icons.ts';
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
const publishedPage = cacheLive('routed-page', (route: string, slug: string) =>
  findPublishedPage(publicClient(), typesAt(route), slug, { onIssue: logIssue(slug) }),
);

/** The content types routed at `route` (e.g. `/[slug]`). */
function typesAt(route: string) {
  return views.routedTypes.filter((contentType) => contentType.route === route);
}

/**
 * Loads the page at an address for rendering, of whichever type is routed
 * there (each type's `route`; landing and simple pages share /[slug], and
 * `/` is the page called home): the live revision normally (cached), the
 * working copy in draft mode (never cached), or an old version when the
 * admin's History asked for one. Returns `null` when there's nothing to show
 * (no type routed there, missing, or hidden outside draft mode). `type` says
 * which content type it is; `version` is set when it's an old version.
 * Deduplicated per request, so `generateMetadata` and the page share one
 * read. `path` is the address's segments, as the catch-all route gets them.
 */
export const loadPage = cache(async (path: readonly string[]) => {
  const match = matchRoute(views.routedTypes, path);
  if (!match) return null;
  const { types, slug } = match;
  const { isEnabled: draft } = await draftMode();
  const working = draft ? await findDraftPage(serviceClient(), types, slug, { onIssue: logIssue(slug) }) : await publishedPage(types[0]!.route!, slug);
  const wanted = draft && working ? await previewedVersion() : null;
  const old = wanted && wanted.pageId === working!.page.id ? await getRevisionPage(serviceClient(), types, wanted.pageId, wanted.version, { onIssue: logIssue(slug) }) : null;
  const found = old ?? working;

  if (!found) return null;
  const contentType = types.find((routedType) => routedType.name === found.type)!;
  if (!draft && contentType.hidden?.(found.page as never)) return null;
  return { ...found, draft, version: old ? wanted!.version : undefined };
});

/**
 * How panels' `load` looks up linked pages, forms, icons and searches:
 * published ones for visitors (cached, like the pages themselves), working
 * copies in draft-mode preview (behind the draft-mode cookie, so the secret
 * key is safe to use there). Forms post to app/api/cera/forms.
 */
export const loadContextFor = createLoadContexts({ contentTypes, publicClient, serviceClient, icons: iconLibrary });
