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
import {
  cancelScheduleAction,
  findMediaAction,
  findPagesAction,
  finishMediaUploadAction,
  prepareMediaUploadAction,
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
  if (!ct) return <p className="cera-status cera-status--error">This site has no content type “{page.contentType}”.</p>;

  return (
    <PageEditor
      contentType={ct}
      contentTypes={contentTypes.map((c) => ({ name: c.name, label: c.label, public: true }))}
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
        if (version === 0) router.replace(`/admin/pages/${page.id}`);
        // Refresh the server-rendered sidebar (titles, the page count).
        else router.refresh();
      }}
      backHref="/admin"
      previewHref={(slug) => `/admin/preview?slug=${encodeURIComponent(slug)}`}
    />
  );
}
