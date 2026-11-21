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
export { accordion, accordionFields } from './accordion.ts';
export { blocks } from './blocks.ts';
export { blocksFields } from './blocks.fields.ts';
export type { BlocksLoaded } from './blocks.load.ts';
export { IconGlyph } from './IconGlyph.tsx';
export { cta, ctaFields } from './cta.ts';
export { decisionTree, decisionTreeFields } from './decision-tree.ts';
export { featuredMedia, featuredMediaFields } from './featured-media.ts';
export { featuredPost, featuredPostFields } from './featured-post.ts';
export { formPanel, formPanelFields } from './form.ts';
export type { FormLoaded } from './form.load.ts';
export { FormClient } from './FormClient.tsx';
export type { FeaturedPostLoaded } from './featured-post.load.ts';
export { gallery, galleryFields } from './gallery.ts';
export { posts, postsFields } from './posts.ts';
export type { PostsLoaded } from './posts.load.ts';
export { quotes, quotesFields } from './quotes.ts';
export { stats, statsFields } from './stats.ts';
export { tabs, tabsFields } from './tabs.ts';
export { text, textFields } from './text.ts';
export { textMedia, textMediaFields } from './text-media.ts';

import { accordion } from './accordion.ts';
import { blocks } from './blocks.ts';
import { cta } from './cta.ts';
import { decisionTree } from './decision-tree.ts';
import { featuredMedia } from './featured-media.ts';
import { featuredPost } from './featured-post.ts';
import { formPanel } from './form.ts';
import { gallery } from './gallery.ts';
import { posts } from './posts.ts';
import { quotes } from './quotes.ts';
import { stats } from './stats.ts';
import { tabs } from './tabs.ts';
import { text } from './text.ts';
import { textMedia } from './text-media.ts';

/** Every core panel, in the order the admin lists them (by label). */
export const corePanels = [accordion, blocks, cta, decisionTree, featuredMedia, featuredPost, formPanel, gallery, posts, quotes, stats, tabs, text, textMedia] as const;

export { PanelFrame, type PanelFrameData } from './PanelFrame.tsx';
export { CtaLink, CtaLinks } from './CtaLinks.tsx';
export { Html } from './Html.tsx';
