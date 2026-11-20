// Ported from set_panel_fields()['stats'] and the theme's `stats` field type:
// { number, decimal, count_down, before_number, after_number, description }.
import { f } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const statsFields = {
  ...panelDefaults,
  stats: f.repeater({
    label: 'Stats',
    itemTitle: 'description',
    fields: {
      before: f.text({ label: 'Before Number', note: 'E.g. “$” or “Over”.' }),
      number: f.number({ label: 'Number' }),
      after: f.text({ label: 'After Number', note: 'E.g. “%”, “+” or “million”.' }),
      decimal: f.toggle({ label: 'One decimal place', note: 'Shows 4.5 instead of rounding to 5.' }),
      countDown: f.toggle({ label: 'Count down', note: 'Counts down to zero from the number, instead of up to it.' }),
      description: f.text({ label: 'Description' }),
    },
  }),
};
