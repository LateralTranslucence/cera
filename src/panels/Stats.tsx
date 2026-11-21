// Ports app/components/panels/Stats.tsx. The HTML holds each final number, so
// it reads right without the script and to search engines; StatCount animates.
import type { PanelPropsOf } from '../panel.ts';
import { Html } from './Html.tsx';
import { PanelFrame } from './PanelFrame.tsx';
import { StatCount } from './StatCount.tsx';
import type { statsFields } from './stats.fields.ts';

export default function Stats({ data, panel }: PanelPropsOf<typeof statsFields>) {
  const items = data.stats.filter((stat) => stat.number !== undefined || stat.before || stat.after);
  return (
    <PanelFrame name="stats" data={data} panel={panel}>
      {items.length > 0 && (
        <ul className="stats">
          {items.map((stat) => (
            <li key={stat._id} className="stats__item">
              <p className="stats__figure">
                {stat.before && <span className="stats__before">{stat.before}</span>}
                {stat.number !== undefined && <StatCount value={stat.number} decimal={stat.decimal} countDown={stat.countDown} />}
                {stat.after && <span className="stats__after">{stat.after}</span>}
              </p>
              {stat.description && <Html html={stat.description} className="stats__description" />}
            </li>
          ))}
        </ul>
      )}
    </PanelFrame>
  );
}
