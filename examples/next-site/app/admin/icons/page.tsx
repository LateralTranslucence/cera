import { iconType } from '@/cera';
import { ListScreen } from '../content-screens.tsx';

export const metadata = { title: 'Icons' };

export default async function Icons({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  return <ListScreen contentType={iconType} group="Library" deleted={(await searchParams).deleted} />;
}
