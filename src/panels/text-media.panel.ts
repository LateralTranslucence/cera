// Ported from the theme's text-media panel. Shown at v2 to demo migrations:
// pretend v1 stored `Media Alignment` under the key `mediaAlignment`; v2
// renamed it to `alignment`. (Fake history: reset to v1 before the first release.)
import { defineCorePanel } from '../define-panel.ts';
import { textMediaFields } from './text-media.fields.ts';

export { textMediaFields };

export const textMedia = defineCorePanel({
  type: 'cera/text-media',
  label: 'Text + Media',
  version: 2,
  fields: textMediaFields,
  migrations: {
    1: ({ mediaAlignment, ...rest }) => ({ ...rest, alignment: mediaAlignment }),
  },
  component: () => import('./TextMedia.tsx'),
});
