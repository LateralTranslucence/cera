import { canEdit, requireStaff } from '@/lib/auth.ts';
import { admin } from '../admin.ts';
import { MediaClient } from './MediaClient.tsx';

export const metadata = { title: 'Media' };

export default async function MediaPage() {
  const staff = await requireStaff();
  return (
    <admin.Shell staff={staff} active="media">
      <div className="cera-screen">
        <div className="cera-screen__head">
          <div>
            <p className="cera-breadcrumb">Library</p>
            <h1 className="cera-screen__title">Media</h1>
          </div>
        </div>
        <MediaClient canEdit={canEdit(staff.role)} />
      </div>
    </admin.Shell>
  );
}
