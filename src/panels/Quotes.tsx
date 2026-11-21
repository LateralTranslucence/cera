// Ports app/components/panels/Quotes.tsx. The theme turned two or more quotes
// into a slider; here the list gets `quotes--slider`, which the stylesheet can
// make a scroll-snap carousel without any script.
import type { PanelPropsOf } from '../panel.ts';
import { CtaLinks } from './CtaLinks.tsx';
import { Html } from './Html.tsx';
import { PanelFrame } from './PanelFrame.tsx';
import type { quotesFields } from './quotes.fields.ts';

export default function Quotes({ data, panel }: PanelPropsOf<typeof quotesFields>) {
  const items = data.quotes.filter((quote) => quote.quote);
  return (
    <PanelFrame name="quotes" data={data} panel={panel}>
      {items.length > 0 && (
        <ul className={`quotes${items.length > 1 ? ' quotes--slider' : ''}`}>
          {items.map((quote) => (
            <li key={quote._id} className="quote">
              <blockquote>
                <Html html={quote.quote!} />
              </blockquote>
              {quote.attribution && <p className="quote__attribution">{quote.attribution}</p>}
            </li>
          ))}
        </ul>
      )}
      <CtaLinks ctas={data.ctas} />
    </PanelFrame>
  );
}
