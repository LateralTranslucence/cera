// Ported from set_panel_fields()['featured-media'].
import { field } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const featuredMediaFields = {
  ...panelDefaults,
  media: field.media({ label: 'Media' }),
  imageLink: field.imageLink({ label: 'Image Link', note: 'Makes the image a link.' }),
  fullWidth: field.toggle({ label: 'Full width', note: 'Stretches the media to the full width of the page (theme: “Full-Width SVG”).' }),
};
