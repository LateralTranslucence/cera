import { iconType } from '@/cera';
import { EditScreen } from '../../content-screens.tsx';

export const metadata = { title: 'Edit icon' };

export default async function EditIcon({ params }: { params: Promise<{ id: string }> }) {
  return <EditScreen ct={iconType} id={(await params).id} />;
}
