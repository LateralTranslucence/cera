import 'server-only';
import type { ComponentType } from 'react';
import { notFound } from 'next/navigation';
import { canEditContentType } from '@lateraltranslucence/cera';
import { Icon } from '@lateraltranslucence/cera/admin';
import type { ShellProps, Staff } from '@lateraltranslucence/cera/next';
import { readableAdminPages } from '../lib/admin-pages.ts';
import { adminPage } from './index.ts';

/** An admin page, for the team to read, at /admin/team/<slug> (theme: DO_Admin_Page_Screen). Its content was sanitized on save. */
export async function TeamScreen({ staff, path, Shell }: { staff: Staff; path: string[]; Shell: ComponentType<ShellProps> }) {
  const [slug, ...rest] = path;
  const page = slug && !rest.length ? (await readableAdminPages(staff)).find((candidate) => candidate.slug === slug) : undefined;
  if (!page) notFound();

  return (
    <Shell staff={staff} active={`team:${slug}`}>
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
    </Shell>
  );
}
