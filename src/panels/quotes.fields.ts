// Ported from set_panel_fields()['quotes'] (stored by the theme as `testimonial_carousel`).
import { f } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const quotesFields = {
  ...panelDefaults,
  quotes: f.repeater({
    label: 'Quotes',
    itemTitle: 'attribution',
    fields: {
      quote: f.html({ label: 'Quote', toolbar: 'limited' }),
      attribution: f.text({ label: 'Attribution' }),
    },
  }),
  ctas: f.ctas({ label: 'CTAs' }),
};
