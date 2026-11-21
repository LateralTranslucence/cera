import { notFound } from 'next/navigation';
import { getPageForEditing } from '@lateraltranslucence/cera/supabase';
import { formType } from '@/cera';
import { canEditContentType } from '@lateraltranslucence/cera';
import { requireStaff } from '@/lib/auth.ts';
import { Shell } from '../../Shell.tsx';
import { EditorClient } from '../../pages/EditorClient.tsx';

export const metadata = { title: 'Edit form' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditForm({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const editable = await getPageForEditing(staff.client, formType, id);
  if (!editable) notFound();

  return (
    <Shell staff={staff} active="forms">
      <EditorClient
        page={editable.page}
        version={editable.version}
        published={editable.published}
        unpublishedChanges={editable.unpublishedChanges}
        updatedAt={editable.updatedAt}
        schedule={editable.schedule}
        readOnly={!canEditContentType(staff.role, formType)}
      />
    </Shell>
  );
}
