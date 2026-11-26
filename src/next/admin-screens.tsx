/**
 * The admin's screens, built from the site's content types: the frame with
 * its sidebar, and every type's list, new and edit screens. A content type
 * says where it goes (`editor.path`, `title`, `icon`, `section`, `listRole`),
 * so adding one to `contentTypes` adds it to the admin; there's nothing else
 * to wire up.
 *
 *   // app/admin/admin.ts
 *   import 'server-only';
 *   export const admin = createAdminScreens({ contentTypes, requireStaff, Editor: EditorClient, signOut: signOutAction });
 *
 *   // app/admin/[type]/page.tsx
 *   export default async function List({ params, searchParams }) {
 *     return <admin.ListScreen path={(await params).type} {...await searchParams} />;
 *   }
 *
 * The site keeps what can't live in a package: its server actions (a
 * 'use server' file of its own) and `Editor`, a client component that
 * imports the content types itself (they hold functions, so they can't be
 * passed from the server) and wraps the package's PageEditor. The site's own
 * screens (submissions, media, people…) use `Shell` and add their sidebar
 * entries with `items`.
 *
 * Forms and icons, the package's own types, get their extra list columns
 * here: a form's submissions (editors and admins) and each icon's picture.
 *
 * createCera (cera.tsx) sets this up for a site; use it directly only to
 * build an admin by hand.
 */
import type { ComponentType, ReactNode } from 'react';
import { notFound, redirect } from 'next/navigation';
import {
  adminNounOf,
  adminNounPluralOf,
  adminPathOf,
  adminTitleOf,
  type AnyContentType,
} from '../content-type.ts';
import type { StoredPage } from '../document.ts';
import { approvalRights, pageRights, type ApprovalRights, type ApprovalSettings, type PageApproval, type PageRights } from '../approvals.ts';
import { CERA_ROLES, canEditContentType, roleAtLeast, type CeraRole, type CeraUser } from '../roles.ts';
import { ApprovalList } from '../admin/ApprovalList.tsx';
import { ApprovalSettingsForm, type ApprovalSettingsFormProps } from '../admin/ApprovalSettingsForm.tsx';
import { AdminSidebar, type NavItem, type NavSection } from '../admin/AdminSidebar.tsx';
import { ContentList } from '../admin/ContentList.tsx';
import { Icon, type IconName } from '../admin/icons.tsx';
import { formType } from '../forms/form-type.ts';
import { iconType } from '../icons/icon-type.ts';
import { getApprovalSettings, getPageApproval, getPageForEditing, listPages, pendingApprovals, submissionCounts, type PageSchedule } from '../supabase/index.ts';
import { supabaseIcons } from '../supabase/icons.ts';
import type { Staff } from './auth.ts';

/** What `Editor` is given: the page and its state, as getPageForEditing reads them. */
export interface AdminEditorProps {
  page: StoredPage;
  version: number;
  published: boolean;
  unpublishedChanges?: boolean;
  updatedAt?: string;
  schedule?: PageSchedule;
  readOnly: boolean;
  /** What this person may do with the page, under the site's approval settings. */
  rights: PageRights;
  /** The page's approval request, and what this person may do about it. */
  approval?: PageApproval | null;
  approvalRights?: ApprovalRights;
}

/** A sidebar entry for one of the site's own screens. */
export interface AdminItem {
  /** Names it for `active`, `before` and `after`. */
  key: string;
  /** The sidebar group, e.g. `Content`. A new name adds a group. */
  section: string;
  label: string;
  href: string;
  icon: IconName;
  count?: number;
  /** Place it before or after another entry: a content type's `editor.path`, or another item's key. Default: last in its group. */
  before?: string;
  after?: string;
}

export interface AdminScreensOptions {
  contentTypes: readonly AnyContentType[];
  /** The signed-in staff member, or a redirect (createStaffAuth's `requireStaff`). */
  requireStaff: (minimum?: CeraRole) => Promise<Staff>;
  /** The site's client wrapper around PageEditor. */
  Editor: ComponentType<AdminEditorProps>;
  /** Signs out: a server action, or the address of a route that signs out on POST. */
  signOut?: (() => Promise<void>) | string;
  /** Sidebar entries for the site's own screens, for this person (leave out what their role can't open). */
  items?: (staff: Staff) => AdminItem[] | Promise<AdminItem[]>;
  /** The order of the sidebar's groups. Groups not named here go before the last one. Default: Content, Library, Site. */
  sections?: readonly string[];
  /** The admin's address. Default `/admin`. */
  basePath?: string;
  /** The user menu's links. Default: Account, and View site. */
  userLinks?: Array<{ label: string; href: string; icon: IconName }>;
  /** Where a form's submissions are listed, given its ID. Default `<basePath>/submissions?form=<id>`. */
  submissionsHref?: string;
}

export interface ShellProps {
  staff: Staff;
  /** The sidebar entry to highlight: a content type's `editor.path`, or an item's key. */
  active?: string;
  /** The page being edited, highlighted in its type's list in the sidebar. */
  currentPageId?: string;
  children: ReactNode;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_NAMES = { admin: 'Admin', editor: 'Editor', author: 'Author', viewer: 'Viewer' } as const;

export function createAdminScreens(options: AdminScreensOptions) {
  const basePath = options.basePath ?? '/admin';
  const sectionOrder = options.sections ?? ['Content', 'Library', 'Site'];
  const submissionsHref = options.submissionsHref ?? `${basePath}/submissions?form=`;
  const { Editor, requireStaff } = options;

  const byPath = new Map<string, AnyContentType>();
  for (const contentType of options.contentTypes) {
    const path = adminPathOf(contentType);
    const taken = byPath.get(path);
    if (taken) throw new Error(`Content types "${taken.name}" and "${contentType.name}" both live at ${basePath}/${path}: give one an editor.path of its own.`);
    byPath.set(path, contentType);
  }

  const listHref = (contentType: AnyContentType) => `${basePath}/${adminPathOf(contentType)}`;
  const listRole = (contentType: AnyContentType): CeraRole => contentType.editor?.listRole ?? 'viewer';
  const visibleTo = (staff: Staff) => options.contentTypes.filter((contentType) => roleAtLeast(staff.role, listRole(contentType)));

  /** The admin's frame: the sidebar, built from the content types and `items`, and the main column. */
  async function Shell({ staff, active, currentPageId, children }: ShellProps) {
    const types = visibleTo(staff);
    // Read as the signed-in user, like the screens they link to.
    const [lists, extras] = await Promise.all([
      Promise.all(types.map((contentType) => listPages(staff.client, { contentType: contentType.name }))),
      options.items?.(staff) ?? [],
    ]);

    type Entry = { key: string; section: string; item: NavItem; before?: string; after?: string };
    const entries: Entry[] = types.map((contentType, index) => {
      const path = adminPathOf(contentType);
      return {
        key: path,
        section: contentType.editor?.section ?? 'Content',
        item: {
          label: adminTitleOf(contentType),
          href: listHref(contentType),
          icon: contentType.editor?.icon ?? 'article',
          active: active === path,
          count: lists[index]!.length,
          expand: {
            defaultOpen: index === 0,
            ...(canEditContentType(staff.role, contentType) && { newHref: `${listHref(contentType)}/new`, newLabel: `New ${adminNounOf(contentType)}` }),
            items: lists[index]!.map((page) => ({ label: page.title || 'Untitled', href: `${listHref(contentType)}/${page.id}`, current: page.id === currentPageId })),
          },
        },
      };
    });
    // The site's own entries, each before or after the one it names.
    for (const extra of extras) {
      const entry: Entry = { key: extra.key, section: extra.section, item: { label: extra.label, href: extra.href, icon: extra.icon, active: active === extra.key, count: extra.count } };
      const anchor = entries.findIndex((candidate) => candidate.key === (extra.before ?? extra.after));
      if (anchor === -1) entries.push(entry);
      else entries.splice(extra.before ? anchor : anchor + 1, 0, entry);
    }

    const names = [...new Set(entries.map((entry) => entry.section))];
    const last = sectionOrder[sectionOrder.length - 1];
    const rank = (name: string) => {
      const index = sectionOrder.indexOf(name);
      // Unnamed groups go before the last named one (e.g. Team before Site).
      return index !== -1 ? (name === last ? sectionOrder.length + 1 : index) : sectionOrder.length;
    };
    const sections: NavSection[] = names
      .sort((first, second) => rank(first) - rank(second))
      .map((name) => ({ label: name, items: entries.filter((entry) => entry.section === name).map((entry) => entry.item) }));

    return (
      <div className="cera-app">
        <AdminSidebar
          homeHref={basePath}
          sections={sections}
          user={{ name: staff.user.email ?? 'Signed in', role: ROLE_NAMES[staff.role] }}
          userLinks={options.userLinks ?? [
            { label: 'Account', href: `${basePath}/account`, icon: 'account' },
            { label: 'View site', href: '/', icon: 'site' },
          ]}
          signOut={options.signOut}
        />
        <main className="cera-app__main">{children}</main>
      </div>
    );
  }

  /** The content type at `<basePath>/<path>`, or a 404. */
  function typeAt(path: string): AnyContentType {
    const contentType = byPath.get(path);
    if (!contentType) notFound();
    return contentType;
  }

  /** A content type's list. `error=forbidden` and `deleted` come from the address (redirects after a refusal or a delete). */
  async function ListScreen({ path, error, deleted }: { path: string; error?: string; deleted?: string }) {
    const contentType = typeAt(path);
    const staff = await requireStaff(listRole(contentType));
    const pages = await listPages(staff.client, { contentType: contentType.name });
    // Icons show themselves: the cleaned SVG of each working copy.
    const previews =
      contentType.name === iconType.name
        ? Object.fromEntries((await supabaseIcons(staff.client, { draft: true }).get(pages.map((page) => page.id))).map((glyph) => [glyph.value.slice('custom:'.length), glyph.svg]))
        : undefined;
    // A form's submissions are personal data: editors and admins only.
    const submissions =
      contentType.name === formType.name && roleAtLeast(staff.role, 'editor')
        ? { counts: Object.fromEntries([...(await submissionCounts(staff.client))].map(([id, count]) => [id, count.total])), href: submissionsHref }
        : undefined;
    const item = contentType.editor?.itemNoun ?? 'panel';

    return (
      <Shell staff={staff} active={path}>
        <div className="cera-screen">
          <div className="cera-screen__head">
            <div>
              <p className="cera-breadcrumb">{contentType.editor?.section ?? 'Content'}</p>
              <h1 className="cera-screen__title">{adminTitleOf(contentType)}</h1>
            </div>
            {canEditContentType(staff.role, contentType) && (
              <a className="cera-button cera-button--primary cera-button--lg" href={`${listHref(contentType)}/new`}>
                <Icon name="plus" size={18} strokeWidth={2} />
                New {adminNounOf(contentType)}
              </a>
            )}
          </div>
          {error === 'forbidden' && <p className="cera-status cera-status--error">Your role can’t do that.</p>}
          {deleted && (
            <p className="cera-status cera-status--success" role="status">
              Deleted “{deleted}”.
            </p>
          )}
          <ContentList
            pages={pages}
            base={listHref(contentType)}
            noun={adminNounOf(contentType)}
            nounPlural={adminNounPluralOf(contentType)}
            countLabel={contentType.panels.length > 0 ? `${item.charAt(0).toUpperCase()}${item.slice(1)}s` : null}
            route={contentType.route}
            previews={previews}
            submissions={submissions}
          />
        </div>
      </Shell>
    );
  }

  /** A new page of a type, unsaved until the editor's first save. */
  async function NewScreen({ path }: { path: string }) {
    const contentType = typeAt(path);
    const staff = await requireStaff('author');
    // Types limited to other roles (editRoles): back to their list.
    if (!canEditContentType(staff.role, contentType)) redirect(`${listHref(contentType)}?error=forbidden`);
    const { settings } = await getApprovalSettings(staff.client);
    const page: StoredPage = { id: crypto.randomUUID(), contentType: contentType.name, slug: '', title: '', boxes: {}, panels: [] };
    return (
      <Shell staff={staff} active={path}>
        <Editor page={page} version={0} published={false} readOnly={false} rights={pageRights(staff.role, contentType, settings)} />
      </Shell>
    );
  }

  /** A page in the editor, read only for roles that can't edit its type. */
  async function EditScreen({ path, id }: { path: string; id: string }) {
    const contentType = typeAt(path);
    const staff = await requireStaff(listRole(contentType));
    if (!UUID.test(id)) notFound();
    // Read as the signed-in user: row-level security decides what they can see.
    const editable = await getPageForEditing(staff.client, contentType, id);
    if (!editable) notFound();
    const [{ settings }, approval] = await Promise.all([getApprovalSettings(staff.client), getPageApproval(staff.client, id)]);
    return (
      <Shell staff={staff} active={path} currentPageId={id}>
        <Editor
          page={editable.page}
          version={editable.version}
          published={editable.published}
          unpublishedChanges={editable.unpublishedChanges}
          updatedAt={editable.updatedAt}
          schedule={editable.schedule}
          readOnly={!canEditContentType(staff.role, contentType)}
          rights={pageRights(staff.role, contentType, settings)}
          approval={approval}
          {...(approval && { approvalRights: approvalRights({ role: staff.role, id: staff.user.id }, contentType, settings, approval) })}
        />
      </Shell>
    );
  }

  /** Every request waiting for approval, those this person can decide first. */
  async function ApprovalsScreen() {
    const staff = await requireStaff();
    const [{ settings }, requests] = await Promise.all([getApprovalSettings(staff.client), pendingApprovals(staff.client)]);
    const items = requests.flatMap((request) => {
      const contentType = options.contentTypes.find((candidate) => candidate.name === request.contentType);
      if (!contentType || !roleAtLeast(staff.role, listRole(contentType))) return [];
      const rights = approvalRights({ role: staff.role, id: staff.user.id }, contentType, settings, { status: 'pending', ...request });
      return [
        {
          id: request.id,
          title: request.title,
          type: contentType.label,
          href: `${listHref(contentType)}/${request.pageId}`,
          awaiting: request.awaiting,
          requestedFor: request.requestedFor,
          submittedAt: request.submittedAt,
          submittedBy: request.submittedBy?.email,
          decide: rights.decide,
          mine: request.submittedBy?.id === staff.user.id,
        },
      ];
    });
    return (
      <Shell staff={staff} active="approvals">
        <div className="cera-screen">
          <div className="cera-screen__head">
            <div>
              <p className="cera-breadcrumb">Content</p>
              <h1 className="cera-screen__title">Approvals</h1>
            </div>
          </div>
          <ApprovalList items={items.sort((first, second) => Number(second.decide) - Number(first.decide))} />
        </div>
      </Shell>
    );
  }

  /**
   * The Approvals sidebar entry, for `items`: nothing while approval is off
   * everywhere and nothing waits. Its count is what this person can decide.
   */
  async function approvalsItem(staff: Staff): Promise<AdminItem[]> {
    const [{ settings }, requests] = await Promise.all([getApprovalSettings(staff.client), pendingApprovals(staff.client)]);
    if (requests.length === 0 && !usesApproval(settings)) return [];
    const count = requests.filter((request) => {
      const contentType = options.contentTypes.find((candidate) => candidate.name === request.contentType);
      return contentType && approvalRights({ role: staff.role, id: staff.user.id }, contentType, settings, { status: 'pending', ...request }).decide;
    }).length;
    return [{ key: 'approvals', section: 'Content', label: 'Approvals', href: `${basePath}/approvals`, icon: 'approvals', ...(count > 0 && { count }) }];
  }

  const usesApproval = (settings: ApprovalSettings) => options.contentTypes.some((contentType) => contentType.publishable !== false && (settings.tiers[contentType.name]?.length ?? 0) > 0);

  /** The site's settings (admins only): approval workflows. `users` (listCeraUsers) lets it point out workflows nobody could finish. */
  async function SettingsScreen({ save, users }: { save: ApprovalSettingsFormProps['onSave']; users?: CeraUser[] }) {
    const staff = await requireStaff('admin');
    const { settings, version } = await getApprovalSettings(staff.client);
    return (
      <Shell staff={staff} active="settings">
        <div className="cera-screen">
          <div className="cera-screen__head">
            <div>
              <p className="cera-breadcrumb">Site</p>
              <h1 className="cera-screen__title">Settings</h1>
            </div>
          </div>
          <ApprovalSettingsForm
            settings={settings}
            version={version}
            types={options.contentTypes
              .filter((contentType) => contentType.publishable !== false)
              .map((contentType) => ({ name: contentType.name, title: adminTitleOf(contentType), ...(contentType.editRoles && { editRoles: contentType.editRoles }) }))}
            {...(users && { people: Object.fromEntries(CERA_ROLES.map((role) => [role, users.filter((user) => user.role === role).length])) })}
            onSave={save}
          />
        </div>
      </Shell>
    );
  }

  /** Each screen's title, for generateMetadata: "Simple Pages", "New simple page", "Edit simple page". */
  function metadataFor(path: string, screen: 'list' | 'new' | 'edit'): { title: string } {
    const contentType = byPath.get(path);
    if (!contentType) return { title: 'Not found' };
    if (screen === 'list') return { title: adminTitleOf(contentType) };
    return { title: `${screen === 'new' ? 'New' : 'Edit'} ${adminNounOf(contentType)}` };
  }

  /** The first content type's list: where the admin's home sends people. */
  const homePath = `${basePath}/${adminPathOf(options.contentTypes[0]!)}`;

  return { Shell, ListScreen, NewScreen, EditScreen, ApprovalsScreen, SettingsScreen, approvalsItem, metadataFor, listHref, homePath };
}

export type AdminScreens = ReturnType<typeof createAdminScreens>;
