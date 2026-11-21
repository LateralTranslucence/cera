// Ported from class-landing-page.php → set_panel_fields()['blocks'].
// Fields live in their own file so the component can import the type
// without a circular `import()` reference (see HANDOFF.md, "Pattern").
import { field } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const blocksFields = {
  ...panelDefaults,
  blocks: field.repeater({
    label: 'Blocks',
    itemTitle: 'title',
    fields: {
      hidden: field.toggle({ label: 'Hidden' }),
      media: field.media({ label: 'Media' }),
      icon: field.icon({ label: 'Icon' }),
      title: field.text({ label: 'Title' }),
      copy: field.html({ label: 'Copy', toolbar: 'limited' }),
      cta: field.cta({ label: 'CTA' }),
    },
  }),
  perRow: field.perRow({ label: 'Blocks Per Row', note: 'Default is 3.' }),
  style: field.select({ label: 'Block Style', options: { card: 'Card (default)', plain: 'Plain' }, default: 'card' }),
  ctas: field.ctas({ label: 'CTA' }),
};
