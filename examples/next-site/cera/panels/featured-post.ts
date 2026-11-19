import { definePanel } from '@lateraltranslucence/cera';
import { featuredPostFields } from './featured-post.fields.ts';
import { loadFeaturedPost } from './featured-post.load.ts';

export { featuredPostFields };

export const featuredPost = definePanel({
  type: 'featured-post',
  label: 'Featured Post',
  fields: featuredPostFields,
  load: loadFeaturedPost,
  component: () => import('./FeaturedPost.tsx'),
});
