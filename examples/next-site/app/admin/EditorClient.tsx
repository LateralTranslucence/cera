'use client';
/**
 * Client wrapper: gives the package's PageEditor this site's content type
 * (which holds functions, so it can't be passed from a Server Component) and
 * the server actions. The admin's screens (admin.ts) render it for every
 * type; nothing here is per type.
 */
import { useRouter } from 'next/navigation';
import { adminNounOf, adminPathOf, adminTitleOf, pageUrl, type PageOf, type StoredPage } from '@lateraltranslucence/cera';
import { mediaUploader, PageEditor } from '@lateraltranslucence/cera/admin';
import type { PageSchedule } from '@lateraltranslucence/cera/supabase';
import { backgroundColors, contentTypes } from '@/cera';
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
} from './actions.ts';

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
  const contentType = contentTypes.find((candidate) => candidate.name === page.contentType);
  if (!contentType) return <p className="cera-status cera-status--error">This site has no content type “{page.contentType}”.</p>;
  // The type's list, which is also its editor's base: /admin/<editor.path>.
  const list = `/admin/${adminPathOf(contentType)}`;

  return (
    <PageEditor
      contentType={contentType}
      contentTypes={contentTypes.map((type) => ({ name: type.name, label: type.label, public: Boolean(type.route) }))}
      colors={backgroundColors}
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
        // A new page lives at /admin/<type>/new until its first save.
        if (version === 0) router.replace(`${list}/${page.id}`);
        // Refresh the server-rendered sidebar (titles, the page count).
        else router.refresh();
      }}
      loadHistory={(before) => pageHistoryAction({ pageId: page.id, before })}
      onRestore={(input) => restoreRevisionAction({ pageId: page.id, contentType: page.contentType, ...input })}
      onDelete={(input) => deletePageAction({ pageId: page.id, ...input })}
      findLinks={() => pageLinksAction(page.id)}
      onDeleted={() => router.replace(`${list}?deleted=${encodeURIComponent(page.title || `Untitled ${adminNounOf(contentType)}`)}`)}
      backHref={list}
      backLabel={adminTitleOf(contentType)}
      {...(contentType.route && {
        // The page's own address (its type's route or url), e.g. /guides/setup.
        previewHref: (slug: string, version?: { pageId: string; version: number }) =>
          `/admin/preview?path=${encodeURIComponent(pageUrl(contentType, { ...page, slug } as PageOf<typeof contentType>))}${version ? `&page=${version.pageId}&version=${version.version}` : ''}`,
      })}
    />
  );
}
