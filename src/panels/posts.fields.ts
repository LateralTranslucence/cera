// Ported from set_panel_fields()['posts']: pick pages (filtered by type) to
// show as cards. Not ported: “Modal” (no modals yet).
import { f } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const postsFields = {
  ...panelDefaults,
  postTypes: f.selectFrom({
    label: 'Post Type',
    note: 'Limits which pages you can pick below. None ticked: any type.',
    multiple: true,
    options: (ctx) => ctx.contentTypes.filter((t) => t.public).map((t) => ({ label: t.label, value: t.name })),
  }),
  posts: f.relation({ label: 'Posts', to: { field: 'postTypes' } }),
  perRow: f.perRow({ label: 'Posts Per Row', note: 'Default is 3.' }),
  slider: f.toggle({ label: 'Slider', note: 'Shows the cards in one row that scrolls sideways, with Previous and Next buttons.' }),
  ctas: f.ctas({ label: 'CTA' }),
};
