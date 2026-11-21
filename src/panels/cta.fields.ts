// Ported from set_panel_fields()['cta']: the default fields plus CTAs.
import { field } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const ctaFields = {
  ...panelDefaults,
  ctas: field.ctas({ label: 'CTA' }),
};
