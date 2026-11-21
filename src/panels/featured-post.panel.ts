import { defineCorePanel } from '../define-panel.ts';
import { featuredPostFields } from './featured-post.fields.ts';
import { loadFeaturedPost } from './featured-post.load.ts';

export { featuredPostFields };

export const featuredPost = defineCorePanel({
  type: 'cera/featured-post',
  label: 'Featured Post',
  fields: featuredPostFields,
  load: loadFeaturedPost,
  component: () => import('./FeaturedPost.tsx'),
});
