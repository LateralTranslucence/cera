// Ports app/components/panels/Blocks.tsx from the theme (markup simplified).
import type { PanelPropsOf } from '../panel.ts';
import { CtaLink, CtaLinks } from './CtaLinks.tsx';
import { Html } from './Html.tsx';
import { PanelFrame } from './PanelFrame.tsx';
import { mediaUrl } from '../media-url.ts';
import type { blocksFields } from './blocks.fields.ts';
import type { BlocksLoaded } from './blocks.load.ts';
import { IconGlyph } from './IconGlyph.tsx';

export default function Blocks({ data, panel, loaded }: PanelPropsOf<typeof blocksFields, BlocksLoaded>) {
  const visible = data.blocks.filter((b) => !b.hidden);
  return (
    <PanelFrame name="blocks" data={data} panel={panel} className={`panel--${data.style}`}>
      <ul className="blocks" style={{ ['--per-row' as string]: data.perRow }}>
        {visible.map((b) => (
          <li key={b._id} className="block">
            {b.media && <img src={mediaUrl(b.media)} alt={b.media.alt ?? ''} width={b.media.width} height={b.media.height} loading="lazy" />}
            {b.icon && loaded.icons[b.icon] && <IconGlyph glyph={loaded.icons[b.icon]!} className="block__icon" />}
            {b.title && <h3>{b.title}</h3>}
            {b.copy && <Html html={b.copy} />}
            {b.cta && <CtaLink cta={b.cta} />}
          </li>
        ))}
      </ul>
      <CtaLinks ctas={data.ctas} />
    </PanelFrame>
  );
}
