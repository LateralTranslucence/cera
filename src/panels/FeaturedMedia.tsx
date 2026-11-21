// Ports app/components/panels/FeaturedMedia.tsx.
import type { PanelPropsOf } from '../panel.ts';
import { PanelFrame } from './PanelFrame.tsx';
import { mediaUrl } from '../media-url.ts';
import type { featuredMediaFields } from './featured-media.fields.ts';

export default function FeaturedMedia({ data, panel }: PanelPropsOf<typeof featuredMediaFields>) {
  const mediaItem = data.media;
  const media =
    mediaItem?.kind === 'video' ? (
      <video src={mediaUrl(mediaItem)} width={mediaItem.width} height={mediaItem.height} controls playsInline preload="metadata" aria-label={mediaItem.alt} />
    ) : mediaItem?.kind === 'embed' ? (
      <a href={mediaItem.path}>{mediaItem.alt || mediaItem.path}</a>
    ) : mediaItem ? (
      <img src={mediaUrl(mediaItem)} alt={mediaItem.alt ?? ''} width={mediaItem.width} height={mediaItem.height} loading="lazy" />
    ) : null;

  return (
    <PanelFrame name="featured-media" data={data} panel={panel} className={data.fullWidth ? 'is-full-width' : undefined}>
      {media && <figure className="featured-media">{data.imageLink && mediaItem?.kind === 'image' ? <a href={data.imageLink}>{media}</a> : media}</figure>}
    </PanelFrame>
  );
}
