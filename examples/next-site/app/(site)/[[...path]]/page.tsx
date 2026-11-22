import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RoutedPage, routedMetadata } from '@/components/RoutedPage.tsx';
import { loadPage } from '@/lib/pages.ts';

// Every content type's pages, at the addresses their `route` gives them
// (landing and simple pages: /[slug], and / for the page called home).
// Rendered per request (draft-mode preview needs the request); the database
// reads behind it are cached and cleared on publish (lib/pages.ts).
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ path?: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loaded = await loadPage((await params).path ?? []);
  return loaded ? routedMetadata(loaded) : {};
}

export default async function Page({ params }: Props) {
  const loaded = await loadPage((await params).path ?? []);
  if (!loaded) notFound();
  return <RoutedPage loaded={loaded} />;
}
