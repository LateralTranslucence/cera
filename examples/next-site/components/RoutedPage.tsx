import type { Metadata } from 'next';
import { pageMetadata } from '@lateraltranslucence/cera/next';
import { mediaUrl } from '@lateraltranslucence/cera/supabase';
import { views } from '../cera/views.ts';
import { loadContextFor, type loadPage } from '../lib/pages.ts';

type Loaded = NonNullable<Awaited<ReturnType<typeof loadPage>>>;

/** Metadata for the page at an address, whatever its type. */
export function routedMetadata(loaded: Loaded): Metadata {
  return pageMetadata(views.typeOf(loaded.type), loaded.page as never, { mediaUrl });
}

/** Renders the page at an address with its type's view (cera/views.ts). */
export function RoutedPage({ loaded }: { loaded: Loaded }) {
  const View = views.viewFor(loaded.type);
  return <View page={loaded.page as never} loadContext={loadContextFor(loaded.draft)} />;
}
