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
import { contentTypes } from '@/cera';
import { placeOf } from '../content.ts';
import {
  cancelScheduleAction,
  deletePageAction,
  findMediaAction,
  findPagesAction,
  finishMediaUploadAction,
  getIconsAction,
  pageHistoryAction,
  pageLinksAction,
  prepareMediaUploadAction,
  restoreRevisionAction,
  savePageAction,
  searchIconsAction,
  unpublishPageAction,
} from '../actions.ts';

const media = {
  upload: mediaUploader({ prepare: prepareMediaUploadAction, finish: finishMediaUploadAction }),
  find: findMediaAction,
};
const icons = { search: searchIconsAction, get: getIconsAction };

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
  const ct = contentTypes.find((contentType) => contentType.name === page.contentType);
  // Each type has its own list and editor path (app/admin/content.ts).
  const { list, base, title, noun } = placeOf(page.contentType);
  if (!ct) return <p className="cera-status cera-status--error">This site has no content type “{page.contentType}”.</p>;

  return (
    <PageEditor
      contentType={ct}
      contentTypes={contentTypes.map((contentType) => ({ name: contentType.name, label: contentType.label, public: Boolean(contentType.route) }))}
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
      icons={icons}
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
      onDeleted={() => router.replace(`${list}?deleted=${encodeURIComponent(page.title || `Untitled ${noun}`)}`)}
      backHref={list}
      backLabel={title}
      {...(ct.route && { previewHref: (slug: string) => `/admin/preview?slug=${encodeURIComponent(slug)}` })}
    />
  );
}
