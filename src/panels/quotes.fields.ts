// Ported from set_panel_fields()['quotes'] (stored by the theme as `testimonial_carousel`).
import { field } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const quotesFields = {
  ...panelDefaults,
  quotes: field.repeater({
    label: 'Quotes',
    itemTitle: 'attribution',
    fields: {
      quote: field.html({ label: 'Quote', toolbar: 'limited' }),
      attribution: field.text({ label: 'Attribution' }),
    },
  }),
  ctas: field.ctas({ label: 'CTAs' }),
};
