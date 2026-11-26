'use client';
/**
 * The admin's browser side, for every screen that needs one: the page
 * editor, sign-in, the password form, People, Settings, Media and
 * Submissions. The site renders it through a one-line wrapper that adds what
 * only the site can import in the browser (its content types, colors and its
 * server action):
 *
 *   // cera/admin-client.tsx
 *   'use client';
 *   export function CeraAdminClient(props: AdminScreenProps) {
 *     return <AdminClient {...props} contentTypes={contentTypes} colors={backgroundColors} action={ceraAction} />;
 *   }
 *
 * The screens themselves are chosen and loaded on the server (createCera).
 */
import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { adminNounOf, adminPathOf, adminTitleOf, pageUrl, type AnyContentType, type PageOf } from '../content-type.ts';
import type { OptionsContext } from '../fields.ts';
import type { ApprovalSettings } from '../approvals.ts';
import type { AdminActions } from '../next/admin-actions.ts';
import type { AdminEditorProps } from '../next/admin-screens.tsx';
import type { CeraRole, CeraUser } from '../roles.ts';
import type { Submission } from '../supabase/forms.ts';
import { ApprovalSettingsForm, type ApprovalType } from './ApprovalSettingsForm.tsx';
import type { CustomControls } from './fields.tsx';
import { CeraLockup } from './icons.tsx';
import { mediaReplacer, mediaUploader } from './media.tsx';
import { MediaManager } from './MediaManager.tsx';
import { PageEditor } from './PageEditor.tsx';
import { SubmissionList } from './SubmissionList.tsx';
import { UsersManager } from './UsersManager.tsx';

/** The admin's actions by name: the site's one server action (createCera's `runAction`). */
export type AdminActionName = keyof AdminActions;
export type AdminAction = <Name extends AdminActionName>(name: Name, ...args: Parameters<AdminActions[Name]>) => Promise<Awaited<ReturnType<AdminActions[Name]>>>;

/** Where things are, as the server says. */
interface Places {
  /** The admin's address, e.g. `/admin`. */
  basePath: string;
  /** Cera's route handlers, e.g. `/api/cera`. */
  apiPath: string;
}

/** What the server renders: one screen and its data. */
export type AdminScreenProps = Places &
  (
    | ({ screen: 'editor'; icons: boolean } & AdminEditorProps)
    | { screen: 'login'; notice?: string }
    | { screen: 'password' }
    | { screen: 'users'; users: CeraUser[]; currentUserId: string }
    | { screen: 'settings'; settings: ApprovalSettings; version: number; types: ApprovalType[]; people?: Partial<Record<CeraRole, number>> }
    | { screen: 'media'; canEdit: boolean }
    | {
        screen: 'submissions';
        submissions: Submission[];
        forms: Array<{ id: string; title: string; slug: string }>;
        formId?: string;
        canDelete: boolean;
        csvHref: string;
        olderHref?: string;
        newestHref?: string;
      }
  );

/** What the site's wrapper adds. */
export interface AdminSiteProps {
  contentTypes: readonly AnyContentType[];
  /** The site's server action that runs the admin's actions: `(name, ...args) => cera.runAction(name, args)` (see createCera). */
  action: (name: AdminActionName, ...args: any[]) => Promise<unknown>;
  /** The site's background colors, for panels. */
  colors?: OptionsContext['colors'];
  /** Controls for the site's custom() field kinds. */
  controls?: CustomControls;
}

export type AdminClientProps = AdminScreenProps & AdminSiteProps;
/** The same, with the action typed per name. */
type ClientProps = AdminScreenProps & Omit<AdminSiteProps, 'action'> & { action: AdminAction };

export function AdminClient(site: AdminClientProps) {
  // The site's action runs whichever action it's named (runAction), so each call returns that action's result.
  const props = site as ClientProps;
  switch (props.screen) {
    case 'editor':
      return <Editor {...props} />;
    case 'login':
      return <LoginForm {...props} />;
    case 'password':
      return <PasswordForm action={props.action} />;
    case 'users':
      return <Users {...props} />;
    case 'settings':
      return (
        <ApprovalSettingsForm
          settings={props.settings}
          version={props.version}
          types={props.types}
          people={props.people}
          onSave={(input) => props.action('saveApprovalSettings', input)}
        />
      );
    case 'media':
      return <Media {...props} />;
    case 'submissions':
      return <Submissions {...props} />;
  }
}

function Editor(props: Extract<ClientProps, { screen: 'editor' }>) {
  const router = useRouter();
  const { page, version, action, basePath, apiPath, contentTypes } = props;
  const contentType = contentTypes.find((candidate) => candidate.name === page.contentType);
  if (!contentType) return <p className="cera-status cera-status--error">This site has no content type “{page.contentType}”.</p>;
  // The type's list, which is also its editor's base: /admin/<editor.path>.
  const list = `${basePath}/${adminPathOf(contentType)}`;
  // The page's own address (its type's route or url), or the type's previewPath (a menu: the home page).
  const previewPath = (slug: string) => (contentType.route ? pageUrl(contentType, { ...page, slug } as PageOf<typeof contentType>) : contentType.editor?.previewPath);

  return (
    <PageEditor
      contentType={contentType}
      contentTypes={contentTypes.map((type) => ({ name: type.name, label: type.label, public: Boolean(type.route) }))}
      colors={props.colors}
      controls={props.controls}
      page={page}
      version={version}
      published={props.published}
      unpublishedChanges={props.unpublishedChanges}
      updatedAt={props.updatedAt}
      schedule={props.schedule}
      readOnly={props.readOnly}
      rights={props.rights}
      approval={props.approval}
      approvalRights={props.approvalRights}
      onSave={(input) => action('savePage', input)}
      onDecide={async (input) => {
        const result = await action('decideApproval', input);
        // The server-rendered sidebar (the Approvals count).
        router.refresh();
        return result;
      }}
      onWithdraw={async (approvalId) => {
        const result = await action('withdrawApproval', approvalId);
        router.refresh();
        return result;
      }}
      findPages={(query) => action('findPages', query)}
      media={{
        upload: mediaUploader({ prepare: (request) => action('prepareMediaUpload', request), finish: (done) => action('finishMediaUpload', done) }),
        find: (query) => action('findMedia', query),
      }}
      {...(props.icons && { icons: { search: (query: string) => action('searchIcons', query), get: (values: string[]) => action('getIcons', values) } })}
      onUnpublish={async () => {
        await action('unpublishPage', page.id);
      }}
      onCancelSchedule={async () => {
        await action('cancelSchedule', page.id);
      }}
      onSaved={() => {
        // A new page lives at /admin/<type>/new until its first save.
        if (version === 0) router.replace(`${list}/${page.id}`);
        // Refresh the server-rendered sidebar (titles, counts).
        else router.refresh();
      }}
      loadHistory={(before) => action('pageHistory', { pageId: page.id, before })}
      onRestore={(input) => action('restoreRevision', { pageId: page.id, contentType: page.contentType, ...input })}
      onDelete={(input) => action('deletePage', { pageId: page.id, ...input })}
      findLinks={() => action('pageLinks', page.id)}
      onDeleted={() => router.replace(`${list}?deleted=${encodeURIComponent(page.title || `Untitled ${adminNounOf(contentType)}`)}`)}
      backHref={list}
      backLabel={adminTitleOf(contentType)}
      {...(previewPath(page.slug) !== undefined && {
        previewHref: (slug: string, saved?: { pageId: string; version: number }) =>
          `${apiPath}/preview?path=${encodeURIComponent(previewPath(slug)!)}${saved ? `&page=${saved.pageId}&version=${saved.version}` : ''}`,
      })}
    />
  );
}

type FormState = { ok?: boolean; error?: string };

function LoginForm({ notice, action, basePath }: Extract<ClientProps, { screen: 'login' }>) {
  const [state, submit, pending] = useActionState<FormState, FormData>((previous, form) => action('signIn', previous, form), {});
  const message = state.error ?? notice;
  return (
    <div className="cera-login">
      <CeraLockup href={basePath} size={40} />
      <form action={submit} className="cera-login__card">
        <h1 className="cera-display" style={{ fontSize: 26, lineHeight: '30px', fontWeight: 600 }}>
          Sign in
        </h1>
        {message && (
          <p className="cera-status cera-status--error" role="alert">
            {message}
          </p>
        )}
        <label>
          Email
          <input name="email" type="text" inputMode="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" className="cera-button cera-button--primary cera-button--lg" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

function PasswordForm({ action }: { action: AdminAction }) {
  const [state, submit, pending] = useActionState<FormState, FormData>((previous, form) => action('changePassword', previous, form), {});
  return (
    <form action={submit} className="cera-password-form">
      <label className="cera-inline">
        New password
        <input type="password" name="password" required minLength={12} autoComplete="new-password" />
      </label>
      <label className="cera-inline">
        New password again
        <input type="password" name="confirm" required minLength={12} autoComplete="new-password" />
      </label>
      <button type="submit" className="cera-button cera-button--primary" disabled={pending}>
        {pending ? 'Saving…' : 'Change password'}
      </button>
      {state.error && (
        <p className="cera-status cera-status--error" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="cera-status cera-status--success" role="status">
          Password changed.
        </p>
      )}
    </form>
  );
}

function Users({ users, currentUserId, action }: Extract<ClientProps, { screen: 'users' }>) {
  const router = useRouter();
  return (
    <UsersManager
      users={users}
      currentUserId={currentUserId}
      onCreate={(input) => action('createUser', input)}
      onSetRole={(input) => action('setUserRole', input)}
      onChanged={() => router.refresh()}
    />
  );
}

function Media({ canEdit, action, contentTypes, basePath }: Extract<ClientProps, { screen: 'media' }>) {
  return (
    <MediaManager
      media={{
        upload: mediaUploader({ prepare: (request) => action('prepareMediaUpload', request), finish: (done) => action('finishMediaUpload', done) }),
        find: (query) => action('findMedia', query),
      }}
      canEdit={canEdit}
      onUpdate={(update) => action('updateMedia', update)}
      onDelete={(id) => action('deleteMedia', id)}
      onReplace={mediaReplacer({ prepare: (request) => action('prepareMediaUpload', request), replace: (replace) => action('replaceMedia', replace) })}
      findUsage={(path) => action('mediaUsage', path)}
      pageHref={(use) => {
        const contentType = contentTypes.find((candidate) => candidate.name === use.contentType);
        return contentType ? `${basePath}/${adminPathOf(contentType)}/${use.id}` : basePath;
      }}
    />
  );
}

function Submissions(props: Extract<ClientProps, { screen: 'submissions' }>) {
  const router = useRouter();
  const list = `${props.basePath}/submissions`;
  return (
    <SubmissionList
      submissions={props.submissions}
      forms={props.forms}
      formId={props.formId}
      csvHref={props.csvHref}
      olderHref={props.olderHref}
      newestHref={props.newestHref}
      onFilter={(formId) => router.push(formId ? `${list}?form=${formId}` : list)}
      {...(props.canDelete && {
        onDelete: async (input: { ids?: string[]; formId?: string }) => {
          const count = await props.action('deleteSubmissions', input);
          router.refresh();
          return count;
        },
      })}
    />
  );
}
