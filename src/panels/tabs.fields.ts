// Ported from set_panel_fields()['tabs'].
import { field } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const tabsFields = {
  ...panelDefaults,
  tabs: field.repeater({
    label: 'Tabs',
    itemTitle: 'navLabel',
    fields: {
      navLabel: field.text({ label: 'Nav Label', note: 'The tab’s button. Also its link: #nav-label opens this tab.' }),
      title: field.text({ label: 'Title' }),
      media: field.media({ label: 'Media' }),
      copy: field.html({ label: 'Copy' }),
      cta: field.cta({ label: 'CTA' }),
    },
  }),
};
