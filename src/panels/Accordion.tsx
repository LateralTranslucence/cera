// Ports app/components/panels/Accordion.tsx. This server part prepares plain
// data; AccordionClient opens and closes the items.
import type { PanelPropsOf } from '../panel.ts';
import { AccordionClient } from './AccordionClient.tsx';
import { PanelFrame } from './PanelFrame.tsx';
import type { accordionFields } from './accordion.fields.ts';

export default function Accordion({ data, panel }: PanelPropsOf<typeof accordionFields>) {
  // An item needs a title to have something to click.
  const items = data.items.filter((item) => item.title).map((item) => ({ id: item._id, title: item.title!, text: item.text }));
  return (
    <PanelFrame name="accordion" data={data} panel={panel} className={data.fullWidth ? 'is-full-width' : undefined}>
      {items.length > 0 && <AccordionClient items={items} />}
    </PanelFrame>
  );
}
