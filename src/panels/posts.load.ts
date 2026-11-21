// Server-side: looks up the picked pages, in the order they were picked. On
// the live site only published, visible pages resolve; in preview, working
// copies do. Pages that don't resolve are left out.
import type { InferFields } from '../fields.ts';
import type { LoadContext } from '../panel.ts';
import type { postsFields } from './posts.fields.ts';

export async function loadPosts(data: InferFields<typeof postsFields>, context: LoadContext) {
  return { pages: data.posts.length > 0 ? await context.pages.byIds(data.posts) : [] };
}

export type PostsLoaded = Awaited<ReturnType<typeof loadPosts>>;
