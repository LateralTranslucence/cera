import type { ReactNode } from 'react';
import { draftMode } from 'next/headers';
import { previewedVersion } from '@lateraltranslucence/cera/next';
import { ExitPreviewLink } from '@/components/ExitPreviewLink.tsx';
import { SiteMenu } from '@/components/SiteMenu.tsx';
import { loadMenu } from '@/lib/menus.ts';
import './globals.css';

export const metadata = { title: { default: 'Cera example', template: '%s · Cera example' } };

/** Public site chrome: draft banner, the main menu and the footer menu (Menus in the admin). The admin has its own layout. */
export default async function SiteLayout({ children }: { children: ReactNode }) {
  const { isEnabled: draft } = await draftMode();
  const [version, main, footer] = await Promise.all([draft ? previewedVersion() : null, loadMenu('main'), loadMenu('footer')]);
  return (
    <>
      {draft && (
        <div className="draft-banner" role="status">
          {version ? `Previewing version ${version.version} of a page, from its history. Other pages show unpublished changes.` : 'Previewing unpublished changes.'} <ExitPreviewLink />
        </div>
      )}
      <header className="site-nav">
        <a href="/" className="site-nav__brand">
          Cera
        </a>
        <SiteMenu links={main} label="Main" className="site-menu" />
      </header>
      {children}
      {footer.length > 0 && (
        <footer className="site-footer">
          <SiteMenu links={footer} label="Footer" className="site-footer__menu" />
        </footer>
      )}
    </>
  );
}
