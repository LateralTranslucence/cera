import { notFound } from 'next/navigation';
import { getPageForEditing } from '@lateraltranslucence/cera/supabase';
import { landingPage } from '@/cera';
import { canEdit, requireStaff } from '@/lib/auth.ts';
import { Shell } from '../../Shell.tsx';
import { EditorClient } from '../EditorClient.tsx';

export const metadata = { title: 'Edit page' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  // Read as the signed-in user: row-level security decides what they can see.
  const editable = await getPageForEditing(staff.client, landingPage, id);
  if (!editable) notFound();

  return (
    <Shell staff={staff}>
      <EditorClient page={editable.page} version={editable.version} published={editable.published} readOnly={!canEdit(staff.role)} />
    </Shell>
  );
}
