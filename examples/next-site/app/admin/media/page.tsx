import { canEdit, requireStaff } from '@/lib/auth.ts';
import { Shell } from '../Shell.tsx';
import { MediaClient } from './MediaClient.tsx';

export const metadata = { title: 'Media' };

export default async function MediaPage() {
  const staff = await requireStaff();
  return (
    <Shell staff={staff}>
      <div className="cera-page-head">
        <h1>Media</h1>
      </div>
      <MediaClient canEdit={canEdit(staff.role)} />
    </Shell>
  );
}
