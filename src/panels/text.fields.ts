// Ported from set_panel_fields()['text']: the default fields plus Overlay and CTAs.
import { field } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const textFields = {
  ...panelDefaults,
  overlay: field.toggle({ label: 'Overlay', note: 'Sets the text over the background in a box, instead of on it.' }),
  ctas: field.ctas({ label: 'CTA' }),
};
