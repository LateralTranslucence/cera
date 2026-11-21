import 'server-only';
import { cache } from 'react';
import { draftMode } from 'next/headers';
import { findDraftPage, findPublishedPage, getRevisionPage } from '@lateraltranslucence/cera/supabase';
import { previewedVersion } from '@lateraltranslucence/cera/next';
import { cacheLive, createLoadContexts } from '@lateraltranslucence/cera/next/cache';
import type { PageIssue } from '@lateraltranslucence/cera';
import { contentTypes, routedTypes } from '../cera/index.ts';
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
const publishedPage = cacheLive('routed-page', (slug: string) => findPublishedPage(publicClient(), routedTypes, slug, { onIssue: logIssue(slug) }));

/**
 * Loads the page at /[slug] for rendering, a landing page or a simple page
 * (they share addresses): the live revision normally (cached), the working
 * copy in draft mode (never cached), or an old version when the admin's
 * History asked for one. Returns `null` when there's nothing to show
 * (missing, or hidden outside draft mode). `type` says which content type it
 * is; `version` is set when it's an old version. Deduplicated per request,
 * so `generateMetadata` and the page share one read.
 */
export const loadPage = cache(async (slug: string) => {
  const { isEnabled: draft } = await draftMode();
  const working = draft ? await findDraftPage(serviceClient(), routedTypes, slug, { onIssue: logIssue(slug) }) : await publishedPage(slug);
  const wanted = draft && working ? await previewedVersion() : null;
  const old = wanted && wanted.pageId === working!.page.id ? await getRevisionPage(serviceClient(), routedTypes, wanted.pageId, wanted.version, { onIssue: logIssue(slug) }) : null;
  const found = old ?? working;

  if (!found) return null;
  const contentType = routedTypes.find((routedType) => routedType.name === found.type)!;
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
