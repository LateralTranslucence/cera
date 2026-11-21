// Server-side: looks up the linked page before the panel renders. On the live
// site only published, visible pages resolve; in preview, working copies do.
import type { InferFields } from '../fields.ts';
import type { LoadContext } from '../panel.ts';
import type { featuredPostFields } from './featured-post.fields.ts';

export async function loadFeaturedPost(data: InferFields<typeof featuredPostFields>, context: LoadContext) {
  const [page] = data.post.length > 0 ? await context.pages.byIds(data.post.slice(0, 1)) : [];
  return { page: page ?? null };
}

export type FeaturedPostLoaded = Awaited<ReturnType<typeof loadFeaturedPost>>;
