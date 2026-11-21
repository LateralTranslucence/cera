// Ported from set_panel_fields()['decision-tree']: two cards, each with a
// short overview and details (copy, a CTA and a list of links) that open in place.
// The theme's separate “CTA Text” and “CTA URL” fields are one CTA here.
import { field } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const decisionTreeFields = {
  ...panelDefaults,
  cards: field.repeater({
    label: 'Cards',
    itemTitle: 'title',
    limit: 2,
    fields: {
      title: field.text({ label: 'Title' }),
      overview: field.html({ label: 'Overview', toolbar: 'limited', note: 'Always shown.' }),
      copy: field.html({ label: 'Copy', note: 'Shown when the card is opened.' }),
      cta: field.cta({ label: 'CTA' }),
      list: field.repeater({
        label: 'List',
        itemTitle: 'title',
        fields: {
          icon: field.media({ label: 'Icon', accept: ['image'] }),
          title: field.text({ label: 'Title' }),
          url: field.url({ label: 'URL' }),
        },
      }),
    },
  }),
};
