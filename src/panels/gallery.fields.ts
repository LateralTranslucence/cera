// Ported from set_panel_fields()['gallery']. The theme stored a title per
// image; here the image's alt text serves as its title.
import { field } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const galleryFields = {
  ...panelDefaults,
  gallery: field.gallery({ label: 'Gallery', note: 'Images open full size when clicked. Each image’s alt text is also its title.' }),
};
