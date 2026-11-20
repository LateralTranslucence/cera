import 'server-only';
import { cache } from 'react';
import { draftMode } from 'next/headers';
import { createFormResolver, createPageResolver, DEFAULT_FORM_ENDPOINT, getDraftPage, getLiveForm, getPublishedPage } from '@lateraltranslucence/cera/supabase';
import { cacheLive } from '@lateraltranslucence/cera/next/cache';
import type { LoadContext, PageIssue } from '@lateraltranslucence/cera';
import { contentTypes, landingPage } from '../cera/index.ts';
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
const publishedLandingPage = cacheLive('landing-page', (slug: string) =>
  getPublishedPage(publicClient(), landingPage, slug, { onIssue: logIssue(slug) }),
);
// Clients are made per read, not when this module loads: `next build` loads
// it without Supabase settings (CI has none).
const liveLinkedPages = cacheLive('linked-pages', (ids: string[]) =>
  createPageResolver(publicClient(), contentTypes, { draft: false }).byIds(ids),
);
const liveForm = cacheLive('form', (id: string) => getLiveForm(publicClient(), id));

/**
 * Loads a landing page for rendering: the live revision normally (cached),
 * the working copy in draft mode (never cached). Returns `null` when there's
 * nothing to show (missing, or hidden outside draft mode). Deduplicated per
 * request, so `generateMetadata` and the page share one read.
 */
export const loadLandingPage = cache(async (slug: string) => {
  const { isEnabled: draft } = await draftMode();
  const result = draft
    ? await getDraftPage(serviceClient(), landingPage, slug, { onIssue: logIssue(slug) })
    : await publishedLandingPage(slug);

  if (!result) return null;
  if (!draft && landingPage.hidden?.(result.page)) return null;
  return { ...result, draft };
});

/**
 * How panels' `load` looks up linked pages and forms: published ones for
 * visitors (cached, like the pages themselves), working copies in draft-mode
 * preview (behind the draft-mode cookie, so the secret key is safe to use
 * there). Forms post to app/api/cera/forms.
 */
export function loadContextFor(draft: boolean): Pick<LoadContext, 'pages' | 'forms' | 'draft'> {
  if (draft) return { pages: createPageResolver(serviceClient(), contentTypes, { draft }), forms: createFormResolver(serviceClient(), { draft }), draft };
  return { pages: { byIds: (ids) => liveLinkedPages([...ids]) }, forms: { byId: liveForm, endpoint: DEFAULT_FORM_ENDPOINT }, draft };
}
