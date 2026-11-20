// Ports app/components/panels/FeaturedMedia.tsx.
import type { PanelPropsOf } from '../panel.ts';
import { PanelFrame } from './PanelFrame.tsx';
import { mediaUrl } from '../media-url.ts';
import type { featuredMediaFields } from './featured-media.fields.ts';

export default function FeaturedMedia({ data, panel }: PanelPropsOf<typeof featuredMediaFields>) {
  const m = data.media;
  const media =
    m?.kind === 'video' ? (
      <video src={mediaUrl(m)} width={m.width} height={m.height} controls playsInline preload="metadata" aria-label={m.alt} />
    ) : m?.kind === 'embed' ? (
      <a href={m.path}>{m.alt || m.path}</a>
    ) : m ? (
      <img src={mediaUrl(m)} alt={m.alt ?? ''} width={m.width} height={m.height} loading="lazy" />
    ) : null;

  return (
    <PanelFrame name="featured-media" data={data} panel={panel} className={data.fullWidth ? 'is-full-width' : undefined}>
      {media && <figure className="featured-media">{data.imageLink && m?.kind === 'image' ? <a href={data.imageLink}>{media}</a> : media}</figure>}
    </PanelFrame>
  );
}
