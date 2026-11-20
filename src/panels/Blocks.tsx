// Ports app/components/panels/Blocks.tsx from the theme (markup simplified).
import type { PanelPropsOf } from '../panel.ts';
import { CtaLink, CtaLinks } from './CtaLinks.tsx';
import { Html } from './Html.tsx';
import { mediaUrl } from '../media-url.ts';
import type { blocksFields } from './blocks.fields.ts';

export default function Blocks({ data, panel }: PanelPropsOf<typeof blocksFields>) {
  const visible = data.blocks.filter((b) => !b.hidden);
  return (
    <section id={data.anchorId} className={`panel panel--blocks panel--${data.style}`} data-index={panel.index}>
      {data.title && <h2>{data.title}</h2>}
      {data.copy && <Html html={data.copy} />}
      <ul className="blocks" style={{ ['--per-row' as string]: data.perRow }}>
        {visible.map((b) => (
          <li key={b._id} className="block">
            {b.media && <img src={mediaUrl(b.media)} alt={b.media.alt ?? ''} width={b.media.width} height={b.media.height} loading="lazy" />}
            {b.title && <h3>{b.title}</h3>}
            {b.copy && <Html html={b.copy} />}
            {b.cta && <CtaLink cta={b.cta} />}
          </li>
        ))}
      </ul>
      <CtaLinks ctas={data.ctas} />
    </section>
  );
}
