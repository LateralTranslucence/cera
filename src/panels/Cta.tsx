// Ports app/components/panels/CTA.tsx. The theme read a single CTA from a
// `ctas` field; this renders all of them.
import type { PanelPropsOf } from '../panel.ts';
import { CtaLinks } from './CtaLinks.tsx';
import { PanelFrame } from './PanelFrame.tsx';
import type { ctaFields } from './cta.fields.ts';

export default function Cta({ data, panel }: PanelPropsOf<typeof ctaFields>) {
  return (
    <PanelFrame name="cta" data={data} panel={panel}>
      <CtaLinks ctas={data.ctas} />
    </PanelFrame>
  );
}
