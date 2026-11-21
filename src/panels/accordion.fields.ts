// Ported from set_panel_fields()['accordion'] and the theme's `accordion` field type ({ title, text } items).
import { field } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const accordionFields = {
  ...panelDefaults,
  items: field.repeater({
    label: 'Accordion Items',
    itemTitle: 'title',
    fields: {
      title: field.text({ label: 'Title' }),
      text: field.html({ label: 'Text' }),
    },
  }),
  fullWidth: field.toggle({ label: 'Full width', note: 'Uses the whole width of the page (theme: “Full Width?”).' }),
};
