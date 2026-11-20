import type { ReactNode } from 'react';
import type { Staff } from '@/lib/auth.ts';
import { signOutAction } from './actions.ts';

/** Top bar for signed-in admin pages. */
export function Shell({ staff, children }: { staff: Staff; children: ReactNode }) {
  return (
    <>
      <header className="cera-shell__bar">
        <a href="/admin" className="cera-shell__brand">Cera admin</a>
        <a href="/" target="_blank" rel="noreferrer">View site</a>
        <span className="cera-shell__user">
          {staff.user.email} · {staff.role}
        </span>
        <form action={signOutAction}>
          <button type="submit" className="cera-button cera-button--small">Sign out</button>
        </form>
      </header>
      <main className="cera-shell__main">{children}</main>
    </>
  );
}
