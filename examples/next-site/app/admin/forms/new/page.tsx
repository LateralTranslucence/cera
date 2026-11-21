import { formType } from '@/cera';
import { NewScreen } from '../../content-screens.tsx';

export const metadata = { title: 'New form' };

export default function NewForm() {
  return <NewScreen contentType={formType} />;
}
