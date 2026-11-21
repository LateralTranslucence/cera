import { simplePage } from '@/cera';
import { NewScreen } from '../../content-screens.tsx';

export const metadata = { title: 'New simple page' };

export default function NewSimplePage() {
  return <NewScreen ct={simplePage} />;
}
