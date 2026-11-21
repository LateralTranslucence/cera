import { simplePage } from '@/cera';
import { EditScreen } from '../../content-screens.tsx';

export const metadata = { title: 'Edit simple page' };

export default async function EditSimplePage({ params }: { params: Promise<{ id: string }> }) {
  return <EditScreen contentType={simplePage} id={(await params).id} />;
}
