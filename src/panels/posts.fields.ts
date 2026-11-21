// Ported from set_panel_fields()['posts']: pick pages (filtered by type) to
// show as cards. Not ported: “Modal” (no modals yet).
import { field } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const postsFields = {
  ...panelDefaults,
  postTypes: field.selectFrom({
    label: 'Post Type',
    note: 'Limits which pages you can pick below. None ticked: any type.',
    multiple: true,
    options: (context) => context.contentTypes.filter((contentType) => contentType.public).map((contentType) => ({ label: contentType.label, value: contentType.name })),
  }),
  posts: field.relation({ label: 'Posts', to: { field: 'postTypes' } }),
  perRow: field.perRow({ label: 'Posts Per Row', note: 'Default is 3.' }),
  slider: field.toggle({ label: 'Slider', note: 'Shows the cards in one row that scrolls sideways, with Previous and Next buttons.' }),
  ctas: field.ctas({ label: 'CTA' }),
};
