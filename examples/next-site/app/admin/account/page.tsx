import { requireStaff } from '@/lib/auth.ts';
import { Shell } from '../Shell.tsx';
import { PasswordForm } from './PasswordForm.tsx';

export const metadata = { title: 'Account' };

export default async function AccountPage() {
  const staff = await requireStaff();
  return (
    <Shell staff={staff}>
      <div className="cera-page-head">
        <h1>Account</h1>
      </div>
      <section className="cera-section">
        <h2>Your password</h2>
        <p className="cera-note">
          Signed in as {staff.user.email}. If an admin gave you a temporary password, change it here.
        </p>
        <PasswordForm />
      </section>
    </Shell>
  );
}
