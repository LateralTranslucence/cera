import type { ReactNode } from 'react';
import { draftMode } from 'next/headers';
import { ExitPreviewLink } from '@/components/ExitPreviewLink.tsx';
import './globals.css';

export const metadata = { title: { default: 'Cera example', template: '%s · Cera example' } };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { isEnabled: draft } = await draftMode();
  return (
    <html lang="en">
      <body>
        {draft && (
          <div className="draft-banner" role="status">
            Previewing unpublished changes. <ExitPreviewLink />
          </div>
        )}
        <nav className="site-nav">
          <a href="/" className="site-nav__brand">Cera</a>
          <a href="/about">About</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
