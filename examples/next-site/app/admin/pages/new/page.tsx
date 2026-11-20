import { randomUUID } from 'node:crypto';
import type { StoredPage } from '@lateraltranslucence/cera';
import { landingPage } from '@/cera';
import { requireStaff } from '@/lib/auth.ts';
import { Shell } from '../../Shell.tsx';
import { EditorClient } from '../EditorClient.tsx';

export const metadata = { title: 'New page' };

export default async function NewPage() {
  const staff = await requireStaff('editor');
  const page: StoredPage = { id: randomUUID(), contentType: landingPage.name, slug: '', title: '', boxes: {}, panels: [] };
  return (
    <Shell staff={staff} active="pages">
      <EditorClient page={page} version={0} published={false} readOnly={false} />
    </Shell>
  );
}
