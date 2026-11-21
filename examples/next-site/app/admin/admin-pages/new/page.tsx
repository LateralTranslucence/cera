import { adminPage } from '@/cera';
import { NewScreen } from '../../content-screens.tsx';

export const metadata = { title: 'New admin page' };

export default function NewAdminPage() {
  return <NewScreen contentType={adminPage} />;
}
