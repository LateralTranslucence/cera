// Ported from set_panel_fields()['featured-post']:
// drops Title/Background/Copy ($unset), dynamic options, post_browser → relation.
import { definePanel, f, omit, panelDefaults, type PanelPropsOf } from '@lateraltranslucence/cera';

export const featuredPostFields = {
  ...omit(panelDefaults, 'title', 'background', 'copy'),
  postTypes: f.selectFrom({
    label: 'Post Type',
    multiple: true,
    options: (ctx) => ctx.contentTypes.filter((t) => t.public).map((t) => ({ label: t.label, value: t.name })),
  }),
  post: f.relation({ label: 'Post', to: { field: 'postTypes' }, limit: 1 }),
  overrideImage: f.media({ label: 'Override Image' }),
  overridePretitle: f.text({ label: 'Override Pretitle' }),
  overrideTitle: f.text({ label: 'Override Title' }),
  overrideDescription: f.html({ label: 'Override Description' }),
  overrideCtaText: f.text({ label: 'Override CTA Text' }),
  overrideUrl: f.url({ label: 'Override URL' }),
  linkTarget: f.select({
    label: 'Link Target',
    options: { _self: 'Self (default)', modal: 'Modal', _blank: 'New Tab/Window' },
    default: '_self',
  }),
};

export type FeaturedPostProps = PanelPropsOf<typeof featuredPostFields>;

export const featuredPost = definePanel({
  type: 'featured-post',
  label: 'Featured Post',
  fields: featuredPostFields,
  // Inline stub so the example stays small; real panels import a .tsx file.
  component: async () => ({ default: (_props: FeaturedPostProps) => null }),
});
