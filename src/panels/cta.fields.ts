// Ported from set_panel_fields()['cta']: the default fields plus CTAs.
import { f } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const ctaFields = {
  ...panelDefaults,
  ctas: f.ctas({ label: 'CTA' }),
};
