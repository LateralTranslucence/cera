/**
 * `@lateraltranslucence/cera/panels` — Cera's own panels, ported from the
 * Developers Only theme. Their types live in the reserved `cera/` namespace,
 * so a site's own panels can't collide with them.
 *
 *   import { corePanels } from '@lateraltranslucence/cera/panels';
 *   defineContentType({ …, panels: [...corePanels, myPanel] });
 *
 * or pick some: `panels: [blocks, featuredPost, textMedia]`. `PanelFrame`
 * renders what every panel shares (section, background, title, copy), for
 * site panels that should look like core ones.
 *
 * Components are imported only when a page renders them. `Html` and the CTA
 * links are exported too, for site components (like a hero) that render the
 * same field types.
 */
export { accordion, accordionFields } from './accordion.panel.ts';
export { blocks } from './blocks.panel.ts';
export { blocksFields } from './blocks.fields.ts';
export type { BlocksLoaded } from './blocks.load.ts';
export { IconGlyph } from './IconGlyph.tsx';
export { cta, ctaFields } from './cta.panel.ts';
export { decisionTree, decisionTreeFields } from './decision-tree.panel.ts';
export { featuredMedia, featuredMediaFields } from './featured-media.panel.ts';
export { featuredPost, featuredPostFields } from './featured-post.panel.ts';
export { formPanel, formPanelFields } from './form.panel.ts';
export type { FormLoaded } from './form.load.ts';
export { FormClient } from './FormClient.tsx';
export type { FeaturedPostLoaded } from './featured-post.load.ts';
export { gallery, galleryFields } from './gallery.panel.ts';
export { posts, postsFields } from './posts.panel.ts';
export type { PostsLoaded } from './posts.load.ts';
export { quotes, quotesFields } from './quotes.panel.ts';
export { stats, statsFields } from './stats.panel.ts';
export { tabs, tabsFields } from './tabs.panel.ts';
export { search, searchFields } from './search.panel.ts';
export type { SearchLoaded } from './search.load.ts';
export { SearchClient, type SearchClientProps } from './SearchClient.tsx';
export * from '../search/model.ts';
export { searchSettingsOf } from './search.load.ts';
export { text, textFields } from './text.panel.ts';
export { textMedia, textMediaFields } from './text-media.panel.ts';

import { accordion } from './accordion.panel.ts';
import { blocks } from './blocks.panel.ts';
import { cta } from './cta.panel.ts';
import { decisionTree } from './decision-tree.panel.ts';
import { featuredMedia } from './featured-media.panel.ts';
import { featuredPost } from './featured-post.panel.ts';
import { formPanel } from './form.panel.ts';
import { gallery } from './gallery.panel.ts';
import { posts } from './posts.panel.ts';
import { quotes } from './quotes.panel.ts';
import { search } from './search.panel.ts';
import { stats } from './stats.panel.ts';
import { tabs } from './tabs.panel.ts';
import { text } from './text.panel.ts';
import { textMedia } from './text-media.panel.ts';

/** Every core panel, in the order the admin lists them (by label). */
export const corePanels = [accordion, blocks, cta, decisionTree, featuredMedia, featuredPost, formPanel, gallery, posts, quotes, search, stats, tabs, text, textMedia] as const;

export { PanelFrame, type PanelFrameData } from './PanelFrame.tsx';
export { CtaLink, CtaLinks } from './CtaLinks.tsx';
export { Html } from './Html.tsx';
