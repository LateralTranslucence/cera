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
  // The theme's image_size crops (functions.php): vertical_600 600×750,
  // cinema_600 600×404 (from the top) and square_600.
  imageSize: field.select({
    label: 'Image Size',
    options: { vertical: 'Vertical', cinema: 'Cinema (wide)', square: 'Square' },
    default: 'cinema',
  }),
  imageLink: field.imageLink({ label: 'Image Link', note: 'Makes the image a link.' }),
  ctas: field.ctas({ label: 'CTA' }),
};
