import { listPages } from '@lateraltranslucence/cera/supabase';
import { landingPage } from '@/cera';
import { canEditContentType } from '@lateraltranslucence/cera';
import { requireStaff } from '@/lib/auth.ts';
import { Icon } from '@lateraltranslucence/cera/admin';
import { Shell } from './Shell.tsx';
import { PageListClient } from './PageListClient.tsx';

export const metadata = { title: 'Pages' };

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string }> }) {
  const staff = await requireStaff();
  const { error, deleted } = await searchParams;
  const pages = await listPages(staff.client, { contentType: landingPage.name });

  return (
    <Shell staff={staff} active="pages">
      <div className="cera-screen">
        <div className="cera-screen__head">
          <div>
            <p className="cera-breadcrumb">Content</p>
            <h1 className="cera-screen__title">Pages</h1>
          </div>
          {canEditContentType(staff.role, landingPage) && (
            <a className="cera-button cera-button--primary cera-button--lg" href="/admin/pages/new">
              <Icon name="plus" size={18} strokeWidth={2} />
              New page
            </a>
          )}
        </div>
        {error === 'forbidden' && <p className="cera-status cera-status--error">Your role can’t do that.</p>}
        {deleted && (
          <p className="cera-status cera-status--success" role="status">
            Deleted “{deleted}”.
          </p>
        )}
        <PageListClient pages={pages} />
      </div>
    </Shell>
  );
}
