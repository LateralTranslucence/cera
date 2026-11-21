import type { ReactNode } from 'react';
import { draftMode } from 'next/headers';
import { previewedVersion } from '@lateraltranslucence/cera/next';
import { ExitPreviewLink } from '@/components/ExitPreviewLink.tsx';
import './globals.css';

export const metadata = { title: { default: 'Cera example', template: '%s · Cera example' } };

/** Public site chrome: draft banner and nav. The admin has its own layout. */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const { isEnabled: draft } = await draftMode();
  const version = draft ? await previewedVersion() : null;
  return (
    <>
      {draft && (
        <div className="draft-banner" role="status">
          {version ? `Previewing version ${version.version} of a page, from its history. Other pages show unpublished changes.` : 'Previewing unpublished changes.'} <ExitPreviewLink />
        </div>
      )}
      <nav className="site-nav">
        <a href="/" className="site-nav__brand">Cera</a>
        <a href="/about">About</a>
        <a href="/panels">Panels</a>
      </nav>
      {children}
    </>
  );
}
