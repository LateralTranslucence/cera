import { randomUUID } from 'node:crypto';
import type { StoredPage } from '@lateraltranslucence/cera';
import { formType } from '@/cera';
import { requireStaff } from '@/lib/auth.ts';
import { Shell } from '../../Shell.tsx';
import { EditorClient } from '../../pages/EditorClient.tsx';

export const metadata = { title: 'New form' };

export default async function NewForm() {
  const staff = await requireStaff('editor');
  const form: StoredPage = { id: randomUUID(), contentType: formType.name, slug: '', title: '', boxes: {}, panels: [] };
  return (
    <Shell staff={staff} active="forms">
      <EditorClient page={form} version={0} published={false} readOnly={false} />
    </Shell>
  );
}
