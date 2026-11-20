import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { pageMetadata } from '@lateraltranslucence/cera/next';
import { landingPage } from '@/cera';
import { LandingPageView } from '@/components/LandingPageView.tsx';
import { mediaUrl } from '@lateraltranslucence/cera/supabase';
import { loadContextFor, loadLandingPage } from '@/lib/pages.ts';

// The home page is the landing page with slug "home" (theme: DO_Landing_Page::onsave).
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const loaded = await loadLandingPage('home');
  return loaded ? pageMetadata(landingPage, loaded.page, { mediaUrl }) : {};
}

export default async function Home() {
  const loaded = await loadLandingPage('home');
  if (!loaded) notFound();
  return <LandingPageView page={loaded.page} loadContext={loadContextFor(loaded.draft)} />;
}
