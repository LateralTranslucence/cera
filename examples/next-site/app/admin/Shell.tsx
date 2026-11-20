import type { ReactNode } from 'react';
import { canManagePeople, type Staff } from '@/lib/auth.ts';
import { signOutAction } from './actions.ts';

/** Top bar for signed-in admin pages. */
export function Shell({ staff, children }: { staff: Staff; children: ReactNode }) {
  return (
    <>
      <header className="cera-shell__bar">
        <a href="/admin" className="cera-shell__brand">Cera admin</a>
        <a href="/admin">Pages</a>
        <a href="/admin/media">Media</a>
        {canManagePeople(staff.role) && <a href="/admin/users">People</a>}
        <a href="/" target="_blank" rel="noreferrer">View site</a>
        <a href="/admin/account" className="cera-shell__user" title="Account">
          {staff.user.email} · {staff.role}
        </a>
        <form action={signOutAction}>
          <button type="submit" className="cera-button cera-button--small">Sign out</button>
        </form>
      </header>
      <main className="cera-shell__main">{children}</main>
    </>
  );
}
