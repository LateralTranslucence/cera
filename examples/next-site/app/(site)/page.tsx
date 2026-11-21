import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { RoutedPage, routedMetadata } from '@/components/RoutedPage.tsx';
import { loadPage } from '@/lib/pages.ts';

// The home page is the page with slug "home" (theme: DO_Landing_Page::onsave).
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const loaded = await loadPage('home');
  return loaded ? routedMetadata(loaded) : {};
}

export default async function Home() {
  const loaded = await loadPage('home');
  if (!loaded) notFound();
  return <RoutedPage loaded={loaded} />;
}
