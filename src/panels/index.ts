/**
 * `@lateraltranslucence/cera/panels` — Cera's own panels, ported from the
 * Developers Only theme. Their types live in the reserved `cera/` namespace,
 * so a site's own panels can't collide with them.
 *
 *   import { blocks, featuredPost, textMedia } from '@lateraltranslucence/cera/panels';
 *   defineContentType({ …, panels: [blocks, featuredPost, textMedia, myPanel] });
 *
 * Components are imported only when a page renders them. `Html` and the CTA
 * links are exported too, for site components (like a hero) that render the
 * same field types.
 */
export { blocks } from './blocks.ts';
export { blocksFields } from './blocks.fields.ts';
export { featuredPost, featuredPostFields } from './featured-post.ts';
export type { FeaturedPostLoaded } from './featured-post.load.ts';
export { textMedia, textMediaFields } from './text-media.ts';
export { CtaLink, CtaLinks } from './CtaLinks.tsx';
export { Html } from './Html.tsx';
