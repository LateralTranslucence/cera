import { UsersManager } from '@lateraltranslucence/cera/admin';
import { listCeraUsers } from '@lateraltranslucence/cera/supabase';
import { requireStaff } from '@/lib/auth.ts';
import { serviceClient } from '@/lib/supabase.ts';
import { createUserAction, setUserRoleAction } from '../actions.ts';
import { admin } from '../admin.ts';

export const metadata = { title: 'People' };

export default async function PeoplePage() {
  const staff = await requireStaff('admin');
  const users = await listCeraUsers(serviceClient());
  return (
    <admin.Shell staff={staff} active="people">
      <div className="cera-screen">
        <div className="cera-screen__head">
          <div>
            <p className="cera-breadcrumb">Site</p>
            <h1 className="cera-screen__title">People</h1>
          </div>
        </div>
        <p className="cera-note">
          Admins add people and set roles. A role change applies to saving and publishing at once; someone already signed in may still see their old view of the admin
          until they sign in again (at most an hour).
        </p>
        <UsersManager users={users} currentUserId={staff.user.id} onCreate={createUserAction} onSetRole={setUserRoleAction} />
      </div>
    </admin.Shell>
  );
}
