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
    .filter((tab) => tab.navLabel)
    .map((tab, i) => {
      // Unique per page, so a link to #label opens the right tab.
      let id = slugForId(tab.navLabel!) || `tab-${i + 1}`;
      if (seen.has(id)) id = `${id}-${i + 1}`;
      seen.add(id);
      return {
        id,
        navLabel: tab.navLabel!,
        title: tab.title,
        copy: tab.copy,
        cta: tab.cta,
        media: tab.media && tab.media.kind !== 'embed' ? { kind: tab.media.kind, src: mediaUrl(tab.media), alt: tab.media.alt ?? '', width: tab.media.width, height: tab.media.height } : undefined,
      };
    });

  return (
    <PanelFrame name="tabs" data={data} panel={panel}>
      {items.length > 0 && <TabsClient items={items} baseId={`p${panel.index}`} />}
    </PanelFrame>
  );
}
