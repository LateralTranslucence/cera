// Ported from set_panel_fields()['featured-post']:
// drops Title/Background/Copy ($unset), dynamic options, post_browser → relation.
// Not ported yet: 'Override Type' (post_type_labels).
import { f } from '../fields.ts';
import { omit, panelDefaults } from '../defaults.ts';

export const featuredPostFields = {
  ...omit(panelDefaults, 'title', 'background', 'copy'),
  postTypes: f.selectFrom({
    label: 'Post Type',
    note: 'Limits which pages you can pick below. None ticked: any type.',
    multiple: true,
    options: (ctx) => ctx.contentTypes.filter((t) => t.public).map((t) => ({ label: t.label, value: t.name })),
  }),
  post: f.relation({ label: 'Post', to: { field: 'postTypes' }, limit: 1 }),
  overrideImage: f.media({ label: 'Override Image', note: 'Default: the page’s SEO image.' }),
  overridePretitle: f.text({ label: 'Override Pretitle', note: 'Default: the page’s type, e.g. “Landing Page”.' }),
  overrideTitle: f.text({ label: 'Override Title', note: 'Default: the page’s title.' }),
  overrideDescription: f.html({ label: 'Override Description', toolbar: 'limited', note: 'Default: the page’s SEO description.' }),
  overrideCtaText: f.text({ label: 'Override CTA Text', note: 'Default: “Read more”.' }),
  overrideUrl: f.url({ label: 'Override URL', note: 'Default: the page’s address.' }),
  linkTarget: f.select({
    label: 'Link Target',
    options: { _self: 'Self (default)', modal: 'Modal', _blank: 'New Tab/Window' },
    default: '_self',
  }),
};
