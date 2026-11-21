import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RoutedPage, routedMetadata } from '@/components/RoutedPage.tsx';
import { loadPage } from '@/lib/pages.ts';

// Rendered per request (draft-mode preview needs the request); the database
// reads behind it are cached and cleared on publish (lib/pages.ts).
// Landing pages and simple pages share this route (and its addresses).
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loaded = await loadPage((await params).slug);
  return loaded ? routedMetadata(loaded) : {};
}

export default async function Page({ params }: Props) {
  const loaded = await loadPage((await params).slug);
  if (!loaded) notFound();
  return <RoutedPage loaded={loaded} />;
}
