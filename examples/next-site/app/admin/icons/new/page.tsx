import { iconType } from '@/cera';
import { NewScreen } from '../../content-screens.tsx';

export const metadata = { title: 'New icon' };

export default function NewIcon() {
  return <NewScreen contentType={iconType} />;
}
