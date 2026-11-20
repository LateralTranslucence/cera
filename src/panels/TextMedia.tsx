import type { PanelPropsOf } from '../panel.ts';
import { CtaLinks } from './CtaLinks.tsx';
import { Html } from './Html.tsx';
import { mediaUrl } from '../media-url.ts';
import type { textMediaFields } from './text-media.fields.ts';

export default function TextMedia({ data, panel }: PanelPropsOf<typeof textMediaFields>) {
  // "alternate" flips sides on every other panel of the page.
  const side = data.alignment === 'alternate' ? (panel.index % 2 === 0 ? 'left' : 'right') : data.alignment;
  const image = data.media && <img src={mediaUrl(data.media)} alt={data.media.alt ?? ''} width={data.media.width} height={data.media.height} loading="lazy" />;

  return (
    <section id={data.anchorId} className={`panel panel--text-media media-${side}`} data-index={panel.index}>
      {data.media && (
        <figure className={`text-media__media size-${data.imageSize ?? 'medium'}`}>
          {data.imageLink ? <a href={data.imageLink}>{image}</a> : image}
        </figure>
      )}
      <div className="text-media__text">
        {data.title && <h2>{data.title}</h2>}
        {data.copy && <Html html={data.copy} />}
        <CtaLinks ctas={data.ctas} />
      </div>
    </section>
  );
}
