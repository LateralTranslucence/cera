import { listPages, submissionCounts } from '@lateraltranslucence/cera/supabase';
import { Icon } from '@lateraltranslucence/cera/admin';
import { formType } from '@/cera';
import { canEditContentType } from '@lateraltranslucence/cera';
import { canEdit, requireStaff } from '@/lib/auth.ts';
import { Shell } from '../Shell.tsx';
import { FormListClient } from './FormListClient.tsx';

export const metadata = { title: 'Forms' };

export default async function FormsPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const staff = await requireStaff();
  const { deleted } = await searchParams;
  const forms = await listPages(staff.client, { contentType: formType.name });
  // Viewers can't read submissions, so they get no counts.
  const counts = canEdit(staff.role) ? Object.fromEntries(await submissionCounts(staff.client)) : null;

  return (
    <Shell staff={staff} active="forms">
      <div className="cera-screen">
        <div className="cera-screen__head">
          <div>
            <p className="cera-breadcrumb">Content</p>
            <h1 className="cera-screen__title">Forms</h1>
          </div>
          {canEditContentType(staff.role, formType) && (
            <a className="cera-button cera-button--primary cera-button--lg" href="/admin/forms/new">
              <Icon name="plus" size={18} strokeWidth={2} />
              New form
            </a>
          )}
        </div>
        {deleted && (
          <p className="cera-status cera-status--success" role="status">
            Deleted “{deleted}”.
          </p>
        )}
        <FormListClient forms={forms} counts={counts} />
      </div>
    </Shell>
  );
}
