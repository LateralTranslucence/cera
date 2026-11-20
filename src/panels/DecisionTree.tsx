// Ports app/components/panels/DecisionTree.tsx. This server part prepares
// plain data; DecisionTreeClient opens and closes the cards.
import type { PanelPropsOf } from '../panel.ts';
import { PanelFrame } from './PanelFrame.tsx';
import { DecisionTreeClient, type DecisionCard } from './DecisionTreeClient.tsx';
import { mediaUrl } from '../media-url.ts';
import type { decisionTreeFields } from './decision-tree.fields.ts';

export default function DecisionTree({ data, panel }: PanelPropsOf<typeof decisionTreeFields>) {
  const cards: DecisionCard[] = data.cards.slice(0, 2).map((c) => ({
    id: c._id,
    title: c.title,
    overview: c.overview,
    copy: c.copy,
    cta: c.cta,
    list: c.list
      .filter((item) => item.title && item.url)
      .map((item) => ({
        id: item._id,
        title: item.title!,
        url: item.url!,
        icon: item.icon ? { src: mediaUrl(item.icon), width: item.icon.width, height: item.icon.height } : undefined,
      })),
  }));

  return (
    <PanelFrame name="decision-tree" data={data} panel={panel}>
      {cards.length > 0 && <DecisionTreeClient cards={cards} />}
    </PanelFrame>
  );
}
