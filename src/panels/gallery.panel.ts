import { defineCorePanel } from '../define-panel.ts';
import { galleryFields } from './gallery.fields.ts';

export { galleryFields };

export const gallery = defineCorePanel({
  type: 'cera/gallery',
  label: 'Gallery',
  description: 'A grid of images that open full size.',
  fields: galleryFields,
  component: () => import('./Gallery.tsx'),
});
