import type { ReactNode } from 'react';
import '@lateraltranslucence/cera/admin.css';

export const metadata = { title: { default: 'Cera admin', template: '%s · Cera admin' }, robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="cera-admin">{children}</div>;
}
