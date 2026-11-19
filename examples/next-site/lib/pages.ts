import 'server-only';
import { cache } from 'react';
import { draftMode } from 'next/headers';
import { createPageResolver, getDraftPage, getPublishedPage } from '@lateraltranslucence/cera/supabase';
import type { LoadContext, PageIssue } from '@lateraltranslucence/cera';
import { contentTypes, landingPage } from '../cera/index.ts';
import { publicClient, serviceClient } from './supabase.ts';

function logIssue(slug: string) {
  return (issue: PageIssue) =>
    console.warn(`cera: [${slug}] ${issue.severity} ${issue.code} at ${issue.path.join('.')}: ${issue.message}`);
}

/**
 * Loads a landing page for rendering: the live revision normally, the working
 * copy in draft mode. Returns `null` when there's nothing to show (missing, or
 * hidden outside draft mode). Cached per request, so `generateMetadata` and the
 * page share one query.
 */
export const loadLandingPage = cache(async (slug: string) => {
  const { isEnabled: draft } = await draftMode();
  const result = draft
    ? await getDraftPage(serviceClient(), landingPage, slug, { onIssue: logIssue(slug) })
    : await getPublishedPage(publicClient(), landingPage, slug, { onIssue: logIssue(slug) });

  if (!result) return null;
  if (!draft && landingPage.hidden?.(result.page)) return null;
  return { ...result, draft };
});

/**
 * How panels' `load` looks up linked pages: published pages for visitors,
 * working copies in draft-mode preview (behind the draft-mode cookie, so the
 * secret key is safe to use there).
 */
export function loadContextFor(draft: boolean): Pick<LoadContext, 'pages' | 'draft'> {
  return { pages: createPageResolver(draft ? serviceClient() : publicClient(), contentTypes, { draft }), draft };
}
