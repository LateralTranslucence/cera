import { defineCorePanel } from '../define-panel.ts';
import { featuredMediaFields } from './featured-media.fields.ts';

export { featuredMediaFields };

export const featuredMedia = defineCorePanel({
  type: 'cera/featured-media',
  label: 'Featured Media',
  description: 'One large image or video, optionally linked.',
  fields: featuredMediaFields,
  component: () => import('./FeaturedMedia.tsx'),
});
