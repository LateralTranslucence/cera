// Ported from class-landing-page.php → set_panel_fields()['blocks'].
// Fields live in their own file so the component can import the type
// without a circular `import()` reference (see HANDOFF.md, "Pattern").
import { f, panelDefaults } from '../../src/index.ts';

export const blocksFields = {
  ...panelDefaults,
  blocks: f.repeater({
    label: 'Blocks',
    itemTitle: 'title',
    fields: {
      hidden: f.toggle({ label: 'Hidden' }),
      media: f.media({ label: 'Media' }),
      icon: f.icon({ label: 'Icon' }),
      title: f.text({ label: 'Title' }),
      copy: f.html({ label: 'Copy', toolbar: 'limited' }),
      cta: f.cta({ label: 'CTA' }),
    },
  }),
  perRow: f.perRow({ label: 'Blocks Per Row', note: 'Default is 3.' }),
  style: f.select({ label: 'Block Style', options: { card: 'Card (default)', plain: 'Plain' }, default: 'card' }),
  ctas: f.ctas({ label: 'CTA' }),
};
