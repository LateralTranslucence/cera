'use client';
/** Client wrapper: gives the package's MediaManager this site's server actions and page links. */
import { MediaManager, mediaReplacer, mediaUploader } from '@lateraltranslucence/cera/admin';
import { deleteMediaAction, findMediaAction, finishMediaUploadAction, mediaUsageAction, prepareMediaUploadAction, replaceMediaAction, updateMediaAction } from '../actions.ts';

const media = {
  upload: mediaUploader({ prepare: prepareMediaUploadAction, finish: finishMediaUploadAction }),
  find: findMediaAction,
};
const replace = mediaReplacer({ prepare: prepareMediaUploadAction, replace: replaceMediaAction });

export function MediaClient({ canEdit }: { canEdit: boolean }) {
  return (
    <MediaManager
      media={media}
      canEdit={canEdit}
      onUpdate={updateMediaAction}
      onDelete={deleteMediaAction}
      onReplace={replace}
      findUsage={mediaUsageAction}
      pageHref={(use) => `/admin/pages/${use.id}`}
    />
  );
}
