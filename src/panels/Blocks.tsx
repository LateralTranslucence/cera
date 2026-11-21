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
  const visible = data.blocks.filter((block) => !block.hidden);
  return (
    <PanelFrame name="blocks" data={data} panel={panel} className={`panel--${data.style}`}>
      <ul className="blocks" style={{ ['--per-row' as string]: data.perRow }}>
        {visible.map((block) => (
          <li key={block._id} className="block">
            {block.media && <img src={mediaUrl(block.media)} alt={block.media.alt ?? ''} width={block.media.width} height={block.media.height} loading="lazy" />}
            {block.icon && loaded.icons[block.icon] && <IconGlyph glyph={loaded.icons[block.icon]!} className="block__icon" />}
            {block.title && <h3>{block.title}</h3>}
            {block.copy && <Html html={block.copy} />}
            {block.cta && <CtaLink cta={block.cta} />}
          </li>
        ))}
      </ul>
      <CtaLinks ctas={data.ctas} />
    </PanelFrame>
  );
}
