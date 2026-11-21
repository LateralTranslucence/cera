import { simplePage } from '@/cera';
import { ListScreen } from '../content-screens.tsx';

export const metadata = { title: 'Simple Pages' };

export default async function SimplePages({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  return <ListScreen contentType={simplePage} group="Content" deleted={(await searchParams).deleted} />;
}
