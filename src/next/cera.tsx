/**
 * The whole admin, and Cera's route handlers, from one call. A site keeps
 * three short files in `app/` and its settings in `cera/`:
 *
 *   // cera/admin.ts
 *   import 'server-only';
 *   export const cera = createCera({ contentTypes, auth, publicClient, serviceClient, Client: CeraAdminClient, icons, sendEmails });
 *
 *   // cera/actions.ts: the admin's one server action
 *   'use server';
 *   export async function ceraAction(name, ...args) { return cera.runAction(name, args); }
 *
 *   // app/admin/[[...path]]/page.tsx: every admin screen
 *   export default cera.Page;
 *   export const generateMetadata = cera.generateMetadata;
 *
 *   // app/api/cera/[...path]/route.ts: forms, search, preview, cleanup, the CSV export, signing out
 *   export const { GET, POST } = cera.routes;
 *
 * Screens and handlers live in the package, so updating Cera updates them.
 * A site adds screens of its own with `screens` and sidebar entries with
 * `items`.
 */
import type { ComponentType, ReactNode } from 'react';
import { draftMode } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminPathOf, adminTitleOf, type AnyContentType } from '../content-type.ts';
import { CERA_ROLES, roleAtLeast } from '../roles.ts';
import { formType } from '../forms/form-type.ts';
import { iconType } from '../icons/icon-type.ts';
import type { IconLibrary } from '../icons/index.ts';
import type { AdminScreenProps } from '../admin/AdminClient.tsx';
import { getApprovalSettings, listCeraUsers, listPages, listSubmissions } from '../supabase/index.ts';
import { createAdminActions, type AdminActions, type AdminActionsOptions } from './admin-actions.ts';
import { createAdminScreens, type AdminItem, type ShellProps } from './admin-screens.tsx';
import type { StaffAuth, Staff } from './auth.ts';
import { cacheLive, pagesChanged } from './cache.ts';
import { createCleanupHandler } from './cleanup.ts';
import { createFormHandler, type FormHandlerOptions } from './forms.ts';
import { createExitPreviewHandler, createPreviewHandler, previewSecret } from './preview.ts';
import { createSearchHandler } from './search.ts';
import { createSubmissionsExportHandler } from './submissions.ts';

/** A screen of the site's own, at `<basePath>/<key>/…`, inside the admin's frame. */
export interface CeraScreen {
  /** Its title, for the browser tab. */
  title: string | ((path: string[]) => string);
  /** Draws it. `path` is what follows the key (e.g. ['about'] for /admin/team/about). Wrap the content in `Shell`. */
  render: (props: { staff: Staff; path: string[]; searchParams: Record<string, string | undefined>; Shell: ComponentType<ShellProps> }) => ReactNode | Promise<ReactNode>;
  /** The role it needs. Default: anyone with access. */
  role?: Staff['role'];
}

export interface CeraOptions {
  contentTypes: readonly AnyContentType[];
  /** createStaffAuth's result: who is signed in. */
  auth: Pick<StaffAuth, 'requireStaff' | 'userClient'>;
  /** Reads live pages: the anonymous (publishable key) client. */
  publicClient: () => SupabaseClient;
  /** The secret-key client, for writes. Server only. */
  serviceClient: () => SupabaseClient;
  /** The site's browser wrapper around AdminClient (it adds the content types and the server action). */
  Client: ComponentType<AdminScreenProps>;
  /** The site's icon sets; `draft` includes the site's own icons' working copies. */
  icons?: (client: SupabaseClient, draft: boolean) => IconLibrary;
  /** Sends form emails (createFormHandler's `sendEmails`). Without it, they're logged and skipped. */
  sendEmails?: FormHandlerOptions['sendEmails'];
  /** Tells people about approvals (createAdminActions' `approvalChanged`). */
  approvalChanged?: AdminActionsOptions['approvalChanged'];
  /** Called after the live site changes. Default: pagesChanged(). */
  liveChanged?: () => void;
  /** Secrets, read per request. Defaults: CERA_PREVIEW_SECRET, CRON_SECRET and SUPABASE_SECRET_KEY. */
  secrets?: { preview?: () => string | undefined; cron?: () => string | undefined; forms?: () => string | undefined };
  /** Screens of the site's own, by the first part of their address. */
  screens?: Record<string, CeraScreen>;
  /** Sidebar entries for them, for this person (leave out what their role can't open). */
  items?: (staff: Staff) => AdminItem[] | Promise<AdminItem[]>;
  /** The order of the sidebar's groups. Default: Content, Library, Site. */
  sections?: readonly string[];
  /** The admin's address. Default `/admin`. */
  basePath?: string;
  /** Where `routes` is mounted. Default `/api/cera`. */
  apiPath?: string;
}

type Params = { params: Promise<{ path?: string[] }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUILT_IN = new Set(['login', 'account', 'users', 'settings', 'approvals', 'media', 'submissions']);
const SUBMISSIONS_BATCH = 50;

/** One value per name: the first of repeated ones. */
function flat(searchParams: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
}

export function createCera(options: CeraOptions) {
  const basePath = options.basePath ?? '/admin';
  const apiPath = options.apiPath ?? '/api/cera';
  const { contentTypes, auth, Client } = options;
  const places = { basePath, apiPath };
  const requireStaff = auth.requireStaff;
  const hasForms = contentTypes.some((contentType) => contentType.name === formType.name);
  const formsType = contentTypes.find((contentType) => contentType.name === formType.name);
  const iconsType = contentTypes.find((contentType) => contentType.name === iconType.name);
  for (const key of Object.keys(options.screens ?? {})) {
    if (BUILT_IN.has(key) || contentTypes.some((contentType) => adminPathOf(contentType) === key)) throw new Error(`createCera: the screen "${key}" has the same address as one of Cera's (${basePath}/${key}). Pick another key.`);
  }

  const actions = createAdminActions({
    contentTypes,
    staff: requireStaff,
    userClient: auth.userClient,
    serviceClient: options.serviceClient,
    ...(options.icons && { icons: (client: SupabaseClient) => options.icons!(client, true) }),
    liveChanged: options.liveChanged ?? pagesChanged,
    approvalChanged: options.approvalChanged,
    paths: { afterSignIn: basePath, signIn: `${basePath}/login` },
  });

  /** Cera's own sidebar entries, before the site's. */
  async function builtInItems(staff: Staff): Promise<AdminItem[]> {
    return [
      ...(await screens.approvalsItem(staff)),
      // Submissions are personal data: editors and admins only.
      ...(hasForms && roleAtLeast(staff.role, 'editor')
        ? [{ key: 'submissions', section: 'Content', label: 'Submissions', href: `${basePath}/submissions`, icon: 'inbox' as const, ...(formsType && { after: adminPathOf(formsType) }) }]
        : []),
      { key: 'media', section: 'Library', label: 'Media', href: `${basePath}/media`, icon: 'media' as const, ...(iconsType && { before: adminPathOf(iconsType) }) },
      ...(staff.role === 'admin'
        ? [
            { key: 'people', section: 'Site', label: 'People', href: `${basePath}/users`, icon: 'people' as const },
            { key: 'settings', section: 'Site', label: 'Settings', href: `${basePath}/settings`, icon: 'sliders' as const },
          ]
        : []),
    ];
  }

  const screens = createAdminScreens({
    contentTypes,
    requireStaff,
    Editor: (props) => <Client screen="editor" icons={Boolean(options.icons)} {...places} {...props} />,
    signOut: `${apiPath}/sign-out`,
    items: async (staff) => [...(await builtInItems(staff)), ...((await options.items?.(staff)) ?? [])],
    sections: options.sections,
    basePath,
    submissionsHref: `${basePath}/submissions?form=`,
  });
  const { Shell } = screens;

  /** A screen's head: the breadcrumb and title. */
  const Head = ({ section, title, children }: { section: string; title: string; children?: ReactNode }) => (
    <div className="cera-screen__head">
      <div>
        <p className="cera-breadcrumb">{section}</p>
        <h1 className="cera-screen__title">{title}</h1>
      </div>
      {children}
    </div>
  );

  async function Account() {
    const staff = await requireStaff();
    return (
      <Shell staff={staff} active="account">
        <div className="cera-screen">
          <Head section="You" title="Account" />
          <section className="cera-section">
            <h2>Your password</h2>
            <p className="cera-note" style={{ marginBottom: 16 }}>
              Signed in as {staff.user.email}. If an admin gave you a temporary password, change it here.
            </p>
            <Client screen="password" {...places} />
          </section>
        </div>
      </Shell>
    );
  }

  async function People() {
    const staff = await requireStaff('admin');
    const users = await listCeraUsers(options.serviceClient());
    return (
      <Shell staff={staff} active="people">
        <div className="cera-screen">
          <Head section="Site" title="People" />
          <p className="cera-note">
            Admins add people and set roles. A role change applies to saving and publishing at once; someone already signed in may still see their old view of the admin
            until they sign in again (at most an hour).
          </p>
          <Client screen="users" users={users} currentUserId={staff.user.id} {...places} />
        </div>
      </Shell>
    );
  }

  async function Settings() {
    const staff = await requireStaff('admin');
    const [{ settings, version }, users] = await Promise.all([getApprovalSettings(staff.client), listCeraUsers(options.serviceClient())]);
    return (
      <Shell staff={staff} active="settings">
        <div className="cera-screen">
          <Head section="Site" title="Settings" />
          <Client
            screen="settings"
            settings={settings}
            version={version}
            types={contentTypes
              .filter((contentType) => contentType.publishable !== false)
              .map((contentType) => ({ name: contentType.name, title: adminTitleOf(contentType), ...(contentType.editRoles && { editRoles: contentType.editRoles }) }))}
            people={Object.fromEntries(CERA_ROLES.map((role) => [role, users.filter((user) => user.role === role).length]))}
            {...places}
          />
        </div>
      </Shell>
    );
  }

  async function Media() {
    const staff = await requireStaff();
    return (
      <Shell staff={staff} active="media">
        <div className="cera-screen">
          <Head section="Library" title="Media" />
          <Client screen="media" canEdit={roleAtLeast(staff.role, 'editor')} {...places} />
        </div>
      </Shell>
    );
  }

  /** What visitors sent through forms. Admins and editors only: it's personal data. */
  async function Submissions({ searchParams }: { searchParams: Record<string, string | undefined> }) {
    const staff = await requireStaff('editor');
    const formId = searchParams.form && UUID.test(searchParams.form) ? searchParams.form : undefined;
    const before = searchParams.before && !Number.isNaN(Date.parse(searchParams.before)) ? searchParams.before : undefined;
    const [forms, submissions] = await Promise.all([
      listPages(staff.client, { contentType: formType.name }),
      // One extra, to know whether there are older ones.
      listSubmissions(staff.client, { formId, before, limit: SUBMISSIONS_BATCH + 1 }),
    ]);
    const shown = submissions.slice(0, SUBMISSIONS_BATCH);
    const query = (extra: Record<string, string | undefined>) => {
      const params = new URLSearchParams(Object.entries({ form: formId, ...extra }).filter((entry): entry is [string, string] => Boolean(entry[1])));
      return params.size ? `?${params}` : '';
    };
    return (
      <Shell staff={staff} active="submissions">
        <div className="cera-screen">
          <Head section="Content" title="Submissions" />
          <Client
            key={`${formId ?? ''}-${before ?? ''}`}
            screen="submissions"
            submissions={shown}
            forms={forms.map((form) => ({ id: form.id, title: form.title, slug: form.slug }))}
            formId={formId}
            canDelete
            csvHref={`${apiPath}/submissions.csv${query({})}`}
            olderHref={submissions.length > SUBMISSIONS_BATCH ? `${basePath}/submissions${query({ before: shown[shown.length - 1]!.createdAt })}` : undefined}
            newestHref={before ? `${basePath}/submissions${query({})}` : undefined}
            {...places}
          />
        </div>
      </Shell>
    );
  }

  /** Every admin screen, by its address: `app/admin/[[...path]]/page.tsx` exports it. */
  async function Page({ params, searchParams }: Params) {
    const path = (await params).path ?? [];
    const query = flat((await searchParams) ?? {});
    const [first, second] = path;

    if (!first) {
      // The admin's home: the first content type's list, keeping ?error= and ?deleted=.
      const kept = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined)).toString();
      redirect(kept ? `${screens.homePath}?${kept}` : screens.homePath);
    }
    if (path.length === 1) {
      switch (first) {
        case 'login':
          return <Client screen="login" notice={query.error === 'no-role' ? 'This account has no Cera role. Ask an admin to give it one.' : undefined} {...places} />;
        case 'account':
          return <Account />;
        case 'users':
          return <People />;
        case 'settings':
          return <Settings />;
        case 'approvals':
          return <screens.ApprovalsScreen />;
        case 'media':
          return <Media />;
        case 'submissions':
          return <Submissions searchParams={query} />;
      }
    }
    const own = options.screens?.[first];
    if (own) {
      const staff = await requireStaff(own.role);
      return own.render({ staff, path: path.slice(1), searchParams: query, Shell });
    }
    if (path.length === 1) return <screens.ListScreen path={first} error={query.error} deleted={query.deleted} />;
    if (path.length === 2 && second === 'new') return <screens.NewScreen path={first} />;
    if (path.length === 2) return <screens.EditScreen path={first} id={second!} />;
    notFound();
  }

  /** Each screen's title, for the browser tab. */
  async function generateMetadata({ params }: Params): Promise<{ title: string }> {
    const path = (await params).path ?? [];
    const [first, second] = path;
    const titles: Record<string, string> = { login: 'Sign in', account: 'Account', users: 'People', settings: 'Settings', approvals: 'Approvals', media: 'Media', submissions: 'Submissions' };
    if (!first) return { title: 'Cera admin' };
    if (path.length === 1 && titles[first]) return { title: titles[first] };
    const own = options.screens?.[first];
    if (own) return { title: typeof own.title === 'function' ? own.title(path.slice(1)) : own.title };
    return screens.metadataFor(first, path.length === 1 ? 'list' : second === 'new' ? 'new' : 'edit');
  }

  /* ---------------------------------------------------------------- */
  /* Route handlers                                                    */
  /* ---------------------------------------------------------------- */

  const secrets = {
    preview: options.secrets?.preview ?? (() => process.env.CERA_PREVIEW_SECRET),
    cron: options.secrets?.cron ?? (() => process.env.CRON_SECRET),
    forms: options.secrets?.forms ?? (() => process.env.SUPABASE_SECRET_KEY),
  };
  const forms = createFormHandler({
    client: options.serviceClient,
    secret: () => {
      const key = secrets.forms();
      if (!key) throw new Error('Missing environment variable SUPABASE_SECRET_KEY (or createCera secrets.forms).');
      return key;
    },
    sendEmails: options.sendEmails,
  });
  const search = createSearchHandler({
    client: options.publicClient,
    draftClient: options.serviceClient,
    isDraft: async () => (await draftMode()).isEnabled,
    contentTypes,
    cache: (key, run) => cacheLive(`search:${key}`, run)(),
  });
  const cleanup = createCleanupHandler({ client: options.serviceClient, secret: secrets.cron });
  // Outside tools preview with the shared secret (?secret=…&slug=about); the admin with its session, so the secret never reaches a browser.
  const draft = createPreviewHandler({ authorize: previewSecret(secrets.preview) });
  const preview = createPreviewHandler({ authorize: async () => Boolean(await requireStaff()) });
  const exitPreview = createExitPreviewHandler();
  const csv = createSubmissionsExportHandler({ client: async () => (await requireStaff('editor')).client });

  async function signOut(): Promise<Response> {
    await (await auth.userClient()).auth.signOut();
    return new Response(null, { status: 303, headers: { Location: `${basePath}/login` } });
  }

  type Handler = (request: Request) => Promise<Response>;
  const handlers: Record<string, { GET?: Handler; POST?: Handler }> = {
    forms: { GET: forms.GET, POST: forms.POST },
    search: { GET: search.GET },
    cleanup: { GET: cleanup.GET },
    draft: { GET: draft.GET },
    preview: { GET: preview.GET },
    'exit-preview': { GET: exitPreview.GET },
    'submissions.csv': { GET: csv.GET },
    'sign-out': { POST: signOut },
  };
  const dispatch = (method: 'GET' | 'POST') => async (request: Request, context: { params: Promise<{ path?: string[] }> }) => {
    const path = (await context.params).path ?? [];
    const route = path.length === 1 && Object.hasOwn(handlers, path[0]!) ? handlers[path[0]!] : undefined;
    if (!route) return new Response('Not found.', { status: 404 });
    const handler = route[method];
    return handler ? handler(request) : new Response('Method not allowed.', { status: 405, headers: { Allow: Object.keys(route).join(', ') } });
  };

  /**
   * Runs one of the admin's actions by name: the site's server action calls
   * it (a 'use server' file must be the site's). Every action checks who is
   * signed in and what their role allows itself.
   */
  async function runAction(name: string, args: unknown[]): Promise<unknown> {
    if (!Object.hasOwn(actions, name)) throw new Error(`Cera has no admin action "${name}".`);
    const action = actions[name as keyof AdminActions] as (...callArguments: unknown[]) => Promise<unknown>;
    return action(...(Array.isArray(args) ? args : []));
  }

  return { Page, generateMetadata, routes: { GET: dispatch('GET'), POST: dispatch('POST') }, runAction, actions, screens };
}

export type Cera = ReturnType<typeof createCera>;
