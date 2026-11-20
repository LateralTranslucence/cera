'use client';
/**
 * Client wrapper: gives the package's PageEditor this site's content type
 * (which holds functions, so it can't be passed from a Server Component) and
 * the server actions.
 */
import { useRouter } from 'next/navigation';
import type { StoredPage } from '@lateraltranslucence/cera';
import { mediaUploader, PageEditor } from '@lateraltranslucence/cera/admin';
import type { PageSchedule } from '@lateraltranslucence/cera/supabase';
import { contentTypes, formType } from '@/cera';
import {
  cancelScheduleAction,
  deletePageAction,
  findMediaAction,
  findPagesAction,
  finishMediaUploadAction,
  pageHistoryAction,
  pageLinksAction,
  prepareMediaUploadAction,
  restoreRevisionAction,
  savePageAction,
  unpublishPageAction,
} from '../actions.ts';

const media = {
  upload: mediaUploader({ prepare: prepareMediaUploadAction, finish: finishMediaUploadAction }),
  find: findMediaAction,
};

export function EditorClient({
  page,
  version,
  published,
  unpublishedChanges = false,
  updatedAt,
  schedule,
  readOnly,
}: {
  page: StoredPage;
  version: number;
  published: boolean;
  unpublishedChanges?: boolean;
  updatedAt?: string;
  schedule?: PageSchedule;
  readOnly: boolean;
}) {
  const router = useRouter();
  const ct = contentTypes.find((c) => c.name === page.contentType);
  // Forms live under /admin/forms; landing pages under /admin/pages, listed at /admin.
  const isForm = page.contentType === formType.name;
  const list = isForm ? '/admin/forms' : '/admin';
  const base = isForm ? '/admin/forms' : '/admin/pages';
  if (!ct) return <p className="cera-status cera-status--error">This site has no content type “{page.contentType}”.</p>;

  return (
    <PageEditor
      contentType={ct}
      contentTypes={contentTypes.map((c) => ({ name: c.name, label: c.label, public: Boolean(c.route) }))}
      page={page}
      version={version}
      published={published}
      unpublishedChanges={unpublishedChanges}
      updatedAt={updatedAt}
      schedule={schedule}
      readOnly={readOnly}
      onSave={savePageAction}
      findPages={findPagesAction}
      media={media}
      onUnpublish={async () => {
        await unpublishPageAction(page.id);
      }}
      onCancelSchedule={async () => {
        await cancelScheduleAction(page.id);
      }}
      onSaved={() => {
        // A new page lives at /admin/pages/new until its first save.
        if (version === 0) router.replace(`${base}/${page.id}`);
        // Refresh the server-rendered sidebar (titles, the page count).
        else router.refresh();
      }}
      loadHistory={(before) => pageHistoryAction({ pageId: page.id, before })}
      onRestore={(input) => restoreRevisionAction({ pageId: page.id, contentType: page.contentType, ...input })}
      onDelete={(input) => deletePageAction({ pageId: page.id, ...input })}
      findLinks={() => pageLinksAction(page.id)}
      onDeleted={() => router.replace(`${list}?deleted=${encodeURIComponent(page.title || `Untitled ${isForm ? 'form' : 'page'}`)}`)}
      backHref={list}
      backLabel={isForm ? 'Forms' : 'Pages'}
      {...(ct.route && { previewHref: (slug: string) => `/admin/preview?slug=${encodeURIComponent(slug)}` })}
    />
  );
}
