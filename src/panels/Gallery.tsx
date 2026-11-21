// Ports app/components/panels/Gallery.tsx. This server part resolves image
// URLs; GalleryClient shows the grid and the full-size view.
import type { PanelPropsOf } from '../panel.ts';
import { GalleryClient, type GalleryImage } from './GalleryClient.tsx';
import { PanelFrame } from './PanelFrame.tsx';
import { mediaUrl } from '../media-url.ts';
import type { galleryFields } from './gallery.fields.ts';

export default function Gallery({ data, panel }: PanelPropsOf<typeof galleryFields>) {
  const images: GalleryImage[] = data.gallery
    .filter((mediaItem) => mediaItem.kind === 'image')
    .map((mediaItem, i) => ({ key: `${mediaItem.id}-${i}`, src: mediaUrl(mediaItem), alt: mediaItem.alt ?? '', width: mediaItem.width, height: mediaItem.height }));
  return (
    <PanelFrame name="gallery" data={data} panel={panel}>
      {images.length > 0 && <GalleryClient images={images} />}
    </PanelFrame>
  );
}
