import { adminPage } from '@/cera';
import { EditScreen } from '../../content-screens.tsx';

export const metadata = { title: 'Edit admin page' };

export default async function EditAdminPage({ params }: { params: Promise<{ id: string }> }) {
  return <EditScreen contentType={adminPage} id={(await params).id} minimum="admin" />;
}
