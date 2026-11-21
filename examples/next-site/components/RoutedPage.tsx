import type { Metadata } from 'next';
import type { PageOf } from '@lateraltranslucence/cera';
import { pageMetadata } from '@lateraltranslucence/cera/next';
import { mediaUrl } from '@lateraltranslucence/cera/supabase';
import { landingPage, simplePage } from '../cera/index.ts';
import { loadContextFor, type loadPage } from '../lib/pages.ts';
import { LandingPageView } from './LandingPageView.tsx';
import { SimplePageView } from './SimplePageView.tsx';

type Loaded = NonNullable<Awaited<ReturnType<typeof loadPage>>>;

/** Metadata for whichever type the page at /[slug] is. */
export function routedMetadata(loaded: Loaded): Metadata {
  return loaded.type === 'simple_page'
    ? pageMetadata(simplePage, loaded.page as PageOf<typeof simplePage>, { mediaUrl })
    : pageMetadata(landingPage, loaded.page as PageOf<typeof landingPage>, { mediaUrl });
}

/** Renders whichever type the page at /[slug] is. */
export function RoutedPage({ loaded }: { loaded: Loaded }) {
  return loaded.type === 'simple_page' ? (
    <SimplePageView page={loaded.page as PageOf<typeof simplePage>} />
  ) : (
    <LandingPageView page={loaded.page as PageOf<typeof landingPage>} loadContext={loadContextFor(loaded.draft)} />
  );
}
