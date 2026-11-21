import type { PanelPropsOf } from '../panel.ts';
import { CtaLinks, linkHref } from './CtaLinks.tsx';
import { Html } from './Html.tsx';
import { PanelFrame } from './PanelFrame.tsx';
import { mediaUrl } from '../media-url.ts';
import type { textMediaFields } from './text-media.fields.ts';

export default function TextMedia({ data, panel }: PanelPropsOf<typeof textMediaFields>) {
  // "alternate" flips sides on every other panel of the page.
  const side = data.alignment === 'alternate' ? (panel.index % 2 === 0 ? 'left' : 'right') : data.alignment;
  const image = data.media && (
    <img src={mediaUrl(data.media)} alt={data.media.alt ?? ''} width={data.media.width} height={data.media.height} loading="lazy" />
  );

  // The title and copy sit beside the media, so they're rendered here rather than by the frame.
  return (
    <PanelFrame name="text-media" data={{ background: data.background, anchorId: data.anchorId }} panel={panel} className={`media-${side}`}>
      <div className="text-media">
        {data.media && (
          <figure className={`text-media__media size-${data.imageSize}`}>
            {/* TODO: imageLink.modal needs a client component, as with a CTA's Modal target; it opens normally for now. */}
            {data.imageLink?.url ? <a href={linkHref(data.imageLink.url)}>{image}</a> : image}
          </figure>
        )}
        <div className="text-media__text">
          {data.title && <h2>{data.title}</h2>}
          {data.copy && <Html html={data.copy} />}
          <CtaLinks ctas={data.ctas} />
        </div>
      </div>
    </PanelFrame>
  );
}
