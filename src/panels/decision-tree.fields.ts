// Ported from set_panel_fields()['decision-tree']: two cards, each with a
// short overview and details (copy, a CTA and a list of links) that open in place.
// The theme's separate “CTA Text” and “CTA URL” fields are one CTA here.
import { f } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const decisionTreeFields = {
  ...panelDefaults,
  cards: f.repeater({
    label: 'Cards',
    itemTitle: 'title',
    limit: 2,
    fields: {
      title: f.text({ label: 'Title' }),
      overview: f.html({ label: 'Overview', toolbar: 'limited', note: 'Always shown.' }),
      copy: f.html({ label: 'Copy', note: 'Shown when the card is opened.' }),
      cta: f.cta({ label: 'CTA' }),
      list: f.repeater({
        label: 'List',
        itemTitle: 'title',
        fields: {
          icon: f.media({ label: 'Icon', accept: ['image'] }),
          title: f.text({ label: 'Title' }),
          url: f.url({ label: 'URL' }),
        },
      }),
    },
  }),
};
