import 'server-only';
import { cache } from 'react';
import { draftMode } from 'next/headers';
import { getDraftPage, getPublishedPage } from '@lateraltranslucence/cera/supabase';
import type { PageIssue } from '@lateraltranslucence/cera';
import { landingPage } from '../cera/index.ts';
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
