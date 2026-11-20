import { UsersManager } from '@lateraltranslucence/cera/admin';
import { listCeraUsers } from '@lateraltranslucence/cera/supabase';
import { requireStaff } from '@/lib/auth.ts';
import { serviceClient } from '@/lib/supabase.ts';
import { createUserAction, setUserRoleAction } from '../actions.ts';
import { Shell } from '../Shell.tsx';

export const metadata = { title: 'People' };

export default async function PeoplePage() {
  const staff = await requireStaff('admin');
  const users = await listCeraUsers(serviceClient());
  return (
    <Shell staff={staff}>
      <div className="cera-page-head">
        <h1>People</h1>
      </div>
      <p className="cera-note">
        Admins add people and set roles. A role change applies to saving and publishing at once; someone already signed in may still see their old view of the admin until
        they sign in again (at most an hour).
      </p>
      <UsersManager users={users} currentUserId={staff.user.id} onCreate={createUserAction} onSetRole={setUserRoleAction} />
    </Shell>
  );
}
