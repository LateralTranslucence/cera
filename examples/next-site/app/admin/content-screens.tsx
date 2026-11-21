/**
 * The list, new and edit screens for content types that don't need screens
 * of their own (simple pages, icons). Each route file is a line or two.
 */
import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import type { AnyContentType, StoredPage } from '@lateraltranslucence/cera';
import { Icon } from '@lateraltranslucence/cera/admin';
import { getPageForEditing, listPages, supabaseIcons } from '@lateraltranslucence/cera/supabase';
import { iconType } from '@/cera';
import { canEdit, requireStaff } from '@/lib/auth.ts';
import { ContentListClient } from './ContentListClient.tsx';
import { placeOf } from './content.ts';
import { EditorClient } from './pages/EditorClient.tsx';
import { Shell, type ShellSection } from './Shell.tsx';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function ListScreen({ ct, group, deleted }: { ct: AnyContentType; group: string; deleted?: string }) {
  const staff = await requireStaff();
  const place = placeOf(ct.name);
  const pages = await listPages(staff.client, { contentType: ct.name });
  // Icons show themselves: the cleaned SVG of each working copy.
  const previews =
    ct.name === iconType.name
      ? Object.fromEntries((await supabaseIcons(staff.client, { draft: true }).get(pages.map((p) => p.id))).map((g) => [g.value.slice('custom:'.length), g.svg]))
      : undefined;

  return (
    <Shell staff={staff} active={place.section as ShellSection}>
      <div className="cera-screen">
        <div className="cera-screen__head">
          <div>
            <p className="cera-breadcrumb">{group}</p>
            <h1 className="cera-screen__title">{place.title}</h1>
          </div>
          {canEdit(staff.role) && (
            <a className="cera-button cera-button--primary cera-button--lg" href={`${place.base}/new`}>
              <Icon name="plus" size={18} strokeWidth={2} />
              New {place.noun}
            </a>
          )}
        </div>
        {deleted && (
          <p className="cera-status cera-status--success" role="status">
            Deleted “{deleted}”.
          </p>
        )}
        <ContentListClient pages={pages} contentType={ct.name} previews={previews} />
      </div>
    </Shell>
  );
}

export async function NewScreen({ ct }: { ct: AnyContentType }) {
  const staff = await requireStaff('editor');
  const page: StoredPage = { id: randomUUID(), contentType: ct.name, slug: '', title: '', boxes: {}, panels: [] };
  return (
    <Shell staff={staff} active={placeOf(ct.name).section as ShellSection}>
      <EditorClient page={page} version={0} published={false} readOnly={false} />
    </Shell>
  );
}

export async function EditScreen({ ct, id }: { ct: AnyContentType; id: string }) {
  const staff = await requireStaff();
  if (!UUID.test(id)) notFound();
  // Read as the signed-in user: row-level security decides what they can see.
  const editable = await getPageForEditing(staff.client, ct, id);
  if (!editable) notFound();
  return (
    <Shell staff={staff} active={placeOf(ct.name).section as ShellSection}>
      <EditorClient
        page={editable.page}
        version={editable.version}
        published={editable.published}
        unpublishedChanges={editable.unpublishedChanges}
        updatedAt={editable.updatedAt}
        schedule={editable.schedule}
        readOnly={!canEdit(staff.role)}
      />
    </Shell>
  );
}
