// Ported from set_panel_fields()['text-media'].
import { field } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const textMediaFields = {
  ...panelDefaults,
  media: field.media({ label: 'Media', note: 'Supports images or Vimeo videos.' }),
  alignment: field.select({
    label: 'Media Alignment',
    options: { left: 'Left', right: 'Right', alternate: 'Alternate' },
    default: 'left',
  }),
  // TODO(verify): theme's `image_size` and `image_link` field types.
  imageSize: field.select({ label: 'Image Size', options: { small: 'Small', medium: 'Medium', large: 'Large' } }),
  imageLink: field.url({ label: 'Image Link' }),
  ctas: field.ctas({ label: 'CTA' }),
};
