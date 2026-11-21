/**
 * The list, new and edit screens for content types that don't need screens
 * of their own (simple pages, icons). Each route file is a line or two.
 */
import { randomUUID } from 'node:crypto';
import { notFound, redirect } from 'next/navigation';
import { canEditContentType, type AnyContentType, type CeraRole, type StoredPage } from '@lateraltranslucence/cera';
import { Icon } from '@lateraltranslucence/cera/admin';
import { getPageForEditing, listPages, supabaseIcons } from '@lateraltranslucence/cera/supabase';
import { iconType } from '@/cera';
import { requireStaff } from '@/lib/auth.ts';
import { ContentListClient } from './ContentListClient.tsx';
import { placeOf } from './content.ts';
import { EditorClient } from './pages/EditorClient.tsx';
import { Shell, type ShellSection } from './Shell.tsx';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `minimum`: the lowest role that may see the list (Admin Pages: admins). */
export async function ListScreen({ contentType, group, deleted, minimum = 'viewer' }: { contentType: AnyContentType; group: string; deleted?: string; minimum?: CeraRole }) {
  const staff = await requireStaff(minimum);
  const place = placeOf(contentType.name);
  const pages = await listPages(staff.client, { contentType: contentType.name });
  // Icons show themselves: the cleaned SVG of each working copy.
  const previews =
    contentType.name === iconType.name
      ? Object.fromEntries((await supabaseIcons(staff.client, { draft: true }).get(pages.map((page) => page.id))).map((glyph) => [glyph.value.slice('custom:'.length), glyph.svg]))
      : undefined;

  return (
    <Shell staff={staff} active={place.section as ShellSection}>
      <div className="cera-screen">
        <div className="cera-screen__head">
          <div>
            <p className="cera-breadcrumb">{group}</p>
            <h1 className="cera-screen__title">{place.title}</h1>
          </div>
          {canEditContentType(staff.role, contentType) && (
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
        <ContentListClient pages={pages} contentType={contentType.name} previews={previews} />
      </div>
    </Shell>
  );
}

export async function NewScreen({ contentType }: { contentType: AnyContentType }) {
  const staff = await requireStaff('editor');
  // Types limited to other roles (editRoles): back to their list.
  if (!canEditContentType(staff.role, contentType)) redirect(`${placeOf(contentType.name).list}?error=forbidden`);
  const page: StoredPage = { id: randomUUID(), contentType: contentType.name, slug: '', title: '', boxes: {}, panels: [] };
  return (
    <Shell staff={staff} active={placeOf(contentType.name).section as ShellSection}>
      <EditorClient page={page} version={0} published={false} readOnly={false} />
    </Shell>
  );
}

/** `minimum`: the lowest role that may open it (Admin Pages: admins). */
export async function EditScreen({ contentType, id, minimum = 'viewer' }: { contentType: AnyContentType; id: string; minimum?: CeraRole }) {
  const staff = await requireStaff(minimum);
  if (!UUID.test(id)) notFound();
  // Read as the signed-in user: row-level security decides what they can see.
  const editable = await getPageForEditing(staff.client, contentType, id);
  if (!editable) notFound();
  return (
    <Shell staff={staff} active={placeOf(contentType.name).section as ShellSection} currentPageId={id}>
      <EditorClient
        page={editable.page}
        version={editable.version}
        published={editable.published}
        unpublishedChanges={editable.unpublishedChanges}
        updatedAt={editable.updatedAt}
        schedule={editable.schedule}
        readOnly={!canEditContentType(staff.role, contentType)}
      />
    </Shell>
  );
}
