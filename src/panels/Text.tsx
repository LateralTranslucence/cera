// Ports app/components/panels/Text.tsx: everything but the CTAs comes from the frame.
import type { PanelPropsOf } from '../panel.ts';
import { CtaLinks } from './CtaLinks.tsx';
import { PanelFrame } from './PanelFrame.tsx';
import type { textFields } from './text.fields.ts';

export default function Text({ data, panel }: PanelPropsOf<typeof textFields>) {
  return (
    <PanelFrame name="text" data={data} panel={panel} className={data.overlay ? 'is-overlay' : undefined}>
      <CtaLinks ctas={data.ctas} />
    </PanelFrame>
  );
}
