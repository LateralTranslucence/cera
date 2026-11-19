// Shown at v2 to demo migrations: pretend v1 stored `Media Alignment` under
// the key `mediaAlignment`; v2 renamed it to `alignment`.
import { definePanel } from '@lateraltranslucence/cera';
import { textMediaFields } from './text-media.fields.ts';

export { textMediaFields };

export const textMedia = definePanel({
  type: 'text-media',
  label: 'Text + Media',
  version: 2,
  fields: textMediaFields,
  migrations: {
    1: ({ mediaAlignment, ...rest }) => ({ ...rest, alignment: mediaAlignment }),
  },
  component: () => import('./TextMedia.tsx'),
});
