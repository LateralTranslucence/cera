import { defineCorePanel } from '../define-panel.ts';
import { postsFields } from './posts.fields.ts';
import { loadPosts } from './posts.load.ts';

export { postsFields };

export const posts = defineCorePanel({
  type: 'cera/posts',
  label: 'Posts',
  description: 'Cards for pages you pick, in a grid or a sideways slider.',
  fields: postsFields,
  load: loadPosts,
  component: () => import('./Posts.tsx'),
});
