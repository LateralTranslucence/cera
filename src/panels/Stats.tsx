// Ports app/components/panels/Stats.tsx. The HTML holds each final number, so
// it reads right without the script and to search engines; StatCount animates.
import type { PanelPropsOf } from '../panel.ts';
import { PanelFrame } from './PanelFrame.tsx';
import { StatCount } from './StatCount.tsx';
import type { statsFields } from './stats.fields.ts';

export default function Stats({ data, panel }: PanelPropsOf<typeof statsFields>) {
  const items = data.stats.filter((s) => s.number !== undefined || s.before || s.after);
  return (
    <PanelFrame name="stats" data={data} panel={panel}>
      {items.length > 0 && (
        <ul className="stats">
          {items.map((s) => (
            <li key={s._id} className="stats__item">
              <p className="stats__figure">
                {s.before && <span className="stats__before">{s.before}</span>}
                {s.number !== undefined && <StatCount value={s.number} decimal={s.decimal} countDown={s.countDown} />}
                {s.after && <span className="stats__after">{s.after}</span>}
              </p>
              {s.description && <p className="stats__description">{s.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </PanelFrame>
  );
}
