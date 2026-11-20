// Ports app/components/panels/Tabs.tsx. This server part prepares plain data;
// TabsClient handles selection and the keyboard.
import type { PanelPropsOf } from '../panel.ts';
import { PanelFrame } from './PanelFrame.tsx';
import { TabsClient, type TabItem } from './TabsClient.tsx';
import { mediaUrl } from '../media-url.ts';
import { slugForId } from './slug.ts';
import type { tabsFields } from './tabs.fields.ts';

export default function Tabs({ data, panel }: PanelPropsOf<typeof tabsFields>) {
  const seen = new Set<string>();
  const items: TabItem[] = data.tabs
    .filter((t) => t.navLabel)
    .map((t, i) => {
      // Unique per page, so a link to #label opens the right tab.
      let id = slugForId(t.navLabel!) || `tab-${i + 1}`;
      if (seen.has(id)) id = `${id}-${i + 1}`;
      seen.add(id);
      return {
        id,
        navLabel: t.navLabel!,
        title: t.title,
        copy: t.copy,
        cta: t.cta,
        media: t.media && t.media.kind !== 'embed' ? { kind: t.media.kind, src: mediaUrl(t.media), alt: t.media.alt ?? '', width: t.media.width, height: t.media.height } : undefined,
      };
    });

  return (
    <PanelFrame name="tabs" data={data} panel={panel}>
      {items.length > 0 && <TabsClient items={items} baseId={`p${panel.index}`} />}
    </PanelFrame>
  );
}
