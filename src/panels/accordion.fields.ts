// Ported from set_panel_fields()['accordion'] and the theme's `accordion` field type ({ title, text } items).
import { f } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const accordionFields = {
  ...panelDefaults,
  items: f.repeater({
    label: 'Accordion Items',
    itemTitle: 'title',
    fields: {
      title: f.text({ label: 'Title' }),
      text: f.html({ label: 'Text' }),
    },
  }),
  fullWidth: f.toggle({ label: 'Full width', note: 'Uses the whole width of the page (theme: “Full Width?”).' }),
};
