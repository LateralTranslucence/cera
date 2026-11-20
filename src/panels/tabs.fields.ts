// Ported from set_panel_fields()['tabs'].
import { f } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const tabsFields = {
  ...panelDefaults,
  tabs: f.repeater({
    label: 'Tabs',
    itemTitle: 'navLabel',
    fields: {
      navLabel: f.text({ label: 'Nav Label', note: 'The tab’s button. Also its link: #nav-label opens this tab.' }),
      title: f.text({ label: 'Title' }),
      media: f.media({ label: 'Media' }),
      copy: f.html({ label: 'Copy' }),
      cta: f.cta({ label: 'CTA' }),
    },
  }),
};
