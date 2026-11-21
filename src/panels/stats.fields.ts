// Ported from set_panel_fields()['stats'] and the theme's `stats` field type:
// { number, decimal, count_down, before_number, after_number, description }.
import { field } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const statsFields = {
  ...panelDefaults,
  stats: field.repeater({
    label: 'Stats',
    itemTitle: 'description',
    fields: {
      before: field.text({ label: 'Before Number', note: 'E.g. “$” or “Over”.' }),
      number: field.number({ label: 'Number' }),
      after: field.text({ label: 'After Number', note: 'E.g. “%”, “+” or “million”.' }),
      decimal: field.toggle({ label: 'One decimal place', note: 'Shows 4.5 instead of rounding to 5.' }),
      countDown: field.toggle({ label: 'Count down', note: 'Counts down to zero from the number, instead of up to it.' }),
      description: field.html({ label: 'Description', toolbar: 'limited' }),
    },
  }),
};
