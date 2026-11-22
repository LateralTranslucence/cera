import { notFound } from 'next/navigation';
import { canEditContentType } from '@lateraltranslucence/cera';
import { Icon } from '@lateraltranslucence/cera/admin';
import { adminPage } from '@/cera';
import { readableAdminPages } from '@/lib/admin-pages.ts';
import { requireStaff } from '@/lib/auth.ts';
import { admin } from '../../admin.ts';

export const metadata = { title: 'Team' };

/** An admin page, for the team to read (theme: DO_Admin_Page_Screen). Its content was sanitized on save. */
export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const staff = await requireStaff();
  const { slug } = await params;
  const page = (await readableAdminPages(staff)).find((candidate) => candidate.slug === slug);
  if (!page) notFound();

  return (
    <admin.Shell staff={staff} active={`team:${slug}`}>
      <div className="cera-screen">
        <div className="cera-screen__head">
          <div>
            <p className="cera-breadcrumb">Team</p>
            <h1 className="cera-screen__title">{page.title}</h1>
          </div>
          {canEditContentType(staff.role, adminPage) && (
            <a className="cera-button cera-button--lg" href={`/admin/admin-pages/${page.id}`}>
              <Icon name="settings" />
              Edit
            </a>
          )}
        </div>
        <article className="cera-card cera-prose" dangerouslySetInnerHTML={{ __html: page.boxes.content.body ?? '' }} />
      </div>
    </admin.Shell>
  );
}
