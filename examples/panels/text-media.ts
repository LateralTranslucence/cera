// Ported from set_panel_fields()['text-media'], shown at v2 to demo migrations:
// pretend v1 stored `Media Alignment` under the key `mediaAlignment`; v2 renamed it to `alignment`.
import { definePanel, f, panelDefaults, type PanelPropsOf } from '../../src/index.ts';

export const textMediaFields = {
  ...panelDefaults,
  media: f.media({ label: 'Media', note: 'Supports images or Vimeo videos.' }),
  alignment: f.select({
    label: 'Media Alignment',
    options: { left: 'Left', right: 'Right', alternate: 'Alternate' },
    default: 'left',
  }),
  // TODO(verify): theme's `image_size` and `image_link` field types.
  imageSize: f.select({ label: 'Image Size', options: { small: 'Small', medium: 'Medium', large: 'Large' } }),
  imageLink: f.url({ label: 'Image Link' }),
  ctas: f.ctas({ label: 'CTA' }),
};

export const textMedia = definePanel({
  type: 'text-media',
  label: 'Text + Media',
  version: 2,
  fields: textMediaFields,
  migrations: {
    1: ({ mediaAlignment, ...rest }) => ({ ...rest, alignment: mediaAlignment }),
  },
  component: async () => ({ default: (_props: PanelPropsOf<typeof textMediaFields>) => null }),
});
