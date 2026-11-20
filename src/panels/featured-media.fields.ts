// Ported from set_panel_fields()['featured-media'].
// Not ported: the theme's image_link `modal` option (no modals yet).
import { f } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const featuredMediaFields = {
  ...panelDefaults,
  media: f.media({ label: 'Media' }),
  imageLink: f.url({ label: 'Image Link', note: 'Makes the image a link.' }),
  fullWidth: f.toggle({ label: 'Full width', note: 'Stretches the media to the full width of the page (theme: “Full-Width SVG”).' }),
};
