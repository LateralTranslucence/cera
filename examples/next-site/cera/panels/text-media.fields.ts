// Ported from set_panel_fields()['text-media'].
import { f, panelDefaults } from '@lateraltranslucence/cera';

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
