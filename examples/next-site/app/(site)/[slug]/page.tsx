import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { pageMetadata } from '@lateraltranslucence/cera/next';
import { landingPage } from '@/cera';
import { LandingPageView } from '@/components/LandingPageView.tsx';
import { mediaUrl } from '@lateraltranslucence/cera/supabase';
import { loadContextFor, loadLandingPage } from '@/lib/pages.ts';

// Rendered per request (draft-mode preview needs the request); the database
// reads behind it are cached and cleared on publish (lib/pages.ts).
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loaded = await loadLandingPage((await params).slug);
  return loaded ? pageMetadata(landingPage, loaded.page, { mediaUrl }) : {};
}

export default async function Page({ params }: Props) {
  const loaded = await loadLandingPage((await params).slug);
  if (!loaded) notFound();
  return <LandingPageView page={loaded.page} loadContext={loadContextFor(loaded.draft)} />;
}
