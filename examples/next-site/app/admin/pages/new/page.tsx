import { landingPage } from '@/cera';
import { NewScreen } from '../../content-screens.tsx';

export const metadata = { title: 'New page' };

export default function NewPage() {
  return <NewScreen contentType={landingPage} />;
}
