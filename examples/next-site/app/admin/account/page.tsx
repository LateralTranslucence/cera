import { requireStaff } from '@/lib/auth.ts';
import { Shell } from '../Shell.tsx';
import { PasswordForm } from './PasswordForm.tsx';

export const metadata = { title: 'Account' };

export default async function AccountPage() {
  const staff = await requireStaff();
  return (
    <Shell staff={staff} active="account">
      <div className="cera-screen">
        <div className="cera-screen__head">
          <div>
            <p className="cera-breadcrumb">You</p>
            <h1 className="cera-screen__title">Account</h1>
          </div>
        </div>
        <section className="cera-section">
          <h2>Your password</h2>
          <p className="cera-note" style={{ marginBottom: 16 }}>
            Signed in as {staff.user.email}. If an admin gave you a temporary password, change it here.
          </p>
          <PasswordForm />
        </section>
      </div>
    </Shell>
  );
}
