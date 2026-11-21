import { adminPage } from '@/cera';
import { ListScreen } from '../content-screens.tsx';

export const metadata = { title: 'Admin Pages' };

// Managing admin pages is for admins (the type's editRoles); everyone reads them under Team.
export default async function AdminPages({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  return <ListScreen contentType={adminPage} group="Site" deleted={(await searchParams).deleted} minimum="admin" />;
}
