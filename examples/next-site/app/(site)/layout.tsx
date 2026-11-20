import type { ReactNode } from 'react';
import { draftMode } from 'next/headers';
import { ExitPreviewLink } from '@/components/ExitPreviewLink.tsx';
import './globals.css';

export const metadata = { title: { default: 'Cera example', template: '%s · Cera example' } };

/** Public site chrome: draft banner and nav. The admin has its own layout. */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const { isEnabled: draft } = await draftMode();
  return (
    <>
      {draft && (
        <div className="draft-banner" role="status">
          Previewing unpublished changes. <ExitPreviewLink />
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
