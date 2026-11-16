// Minimal component to prove the props are fully typed from blocksFields.
// The real markup ports app/components/panels/Blocks.tsx from the theme.
import type { PanelPropsOf } from '../../src/index.ts';
import type { blocksFields } from './blocks.fields.ts';

export default function Blocks({ data, panel }: PanelPropsOf<typeof blocksFields>) {
  const visible = data.blocks.filter((b) => !b.hidden);
  return (
    <section id={data.anchorId} className={`panel panel--blocks panel--${data.style}`} data-index={panel.index}>
      {data.title && <h2>{data.title}</h2>}
      <ul style={{ ['--per-row' as string]: data.perRow }}>
        {visible.map((b) => (
          <li key={b._id}>
            {b.media && <img src={b.media.path} alt={b.media.alt ?? ''} />}
            {b.title && <h3>{b.title}</h3>}
            {b.cta && <a href={b.cta.url} target={b.cta.target === '_blank' ? '_blank' : undefined}>{b.cta.text}</a>}
          </li>
        ))}
      </ul>
    </section>
  );
}
