'use client';
/** Client wrapper: gives the package's MediaManager this site's server actions and page links. */
import { MediaManager, mediaUploader } from '@lateraltranslucence/cera/admin';
import { deleteMediaAction, findMediaAction, finishMediaUploadAction, mediaUsageAction, prepareMediaUploadAction, updateMediaAction } from '../actions.ts';

const media = {
  upload: mediaUploader({ prepare: prepareMediaUploadAction, finish: finishMediaUploadAction }),
  find: findMediaAction,
};

export function MediaClient({ canEdit }: { canEdit: boolean }) {
  return (
    <MediaManager
      media={media}
      canEdit={canEdit}
      onUpdate={updateMediaAction}
      onDelete={deleteMediaAction}
      findUsage={mediaUsageAction}
      pageHref={(use) => `/admin/pages/${use.id}`}
    />
  );
}
