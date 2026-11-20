import type { ReactNode } from 'react';
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';
import '@lateraltranslucence/cera/admin.css';

// Self-hosted at build time by next/font; the admin's CSS reads these variables.
const display = Fraunces({ subsets: ['latin'], axes: ['SOFT', 'opsz'], variable: '--cera-font-display', display: 'swap' });
const sans = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--cera-font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400'], variable: '--cera-font-mono', display: 'swap' });

export const metadata = {
  title: { default: 'Cera admin', template: '%s · Cera admin' },
  robots: { index: false, follow: false },
  icons: { icon: '/cera-seal-small.svg' },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className={`cera-admin ${display.variable} ${sans.variable} ${mono.variable}`}>{children}</div>;
}
