// Ported from set_panel_fields()['featured-post']:
// drops Title/Background/Copy ($unset), dynamic options, post_browser → relation.
// Not ported yet: 'Override Type' (post_type_labels).
import { field } from '../fields.ts';
import { omit, panelDefaults } from '../defaults.ts';

export const featuredPostFields = {
  ...omit(panelDefaults, 'title', 'background', 'copy'),
  postTypes: field.selectFrom({
    label: 'Post Type',
    note: 'Limits which pages you can pick below. None ticked: any type.',
    multiple: true,
    options: (context) => context.contentTypes.filter((contentType) => contentType.public).map((contentType) => ({ label: contentType.label, value: contentType.name })),
  }),
  post: field.relation({ label: 'Post', to: { field: 'postTypes' }, limit: 1 }),
  overrideImage: field.media({ label: 'Override Image', note: 'Default: the page’s SEO image.' }),
  overridePretitle: field.text({ label: 'Override Pretitle', note: 'Default: the page’s type, e.g. “Landing Page”.' }),
  overrideTitle: field.text({ label: 'Override Title', note: 'Default: the page’s title.' }),
  overrideDescription: field.html({ label: 'Override Description', toolbar: 'limited', note: 'Default: the page’s SEO description.' }),
  overrideCtaText: field.text({ label: 'Override CTA Text', note: 'Default: “Read more”.' }),
  overrideUrl: field.url({ label: 'Override URL', note: 'Default: the page’s address.' }),
  linkTarget: field.select({
    label: 'Link Target',
    options: { _self: 'Self (default)', modal: 'Modal', _blank: 'New Tab/Window' },
    default: '_self',
  }),
};
