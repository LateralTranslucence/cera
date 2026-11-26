// Ports app/components/panels/DecisionTree.tsx. This server part prepares
// plain data; DecisionTreeClient opens and closes the cards.
import { safeHref } from '../links.ts';
import type { PanelPropsOf } from '../panel.ts';
import { PanelFrame } from './PanelFrame.tsx';
import { DecisionTreeClient, type DecisionCard } from './DecisionTreeClient.tsx';
import { mediaUrl } from '../media-url.ts';
import type { decisionTreeFields } from './decision-tree.fields.ts';

export default function DecisionTree({ data, panel }: PanelPropsOf<typeof decisionTreeFields>) {
  const cards: DecisionCard[] = data.cards.slice(0, 2).map((card) => ({
    id: card._id,
    title: card.title,
    overview: card.overview,
    copy: card.copy,
    cta: card.cta,
    list: card.list
      .filter((item) => item.title && safeHref(item.url))
      .map((item) => ({
        id: item._id,
        title: item.title!,
        url: safeHref(item.url)!,
        icon: item.icon ? { src: mediaUrl(item.icon), width: item.icon.width, height: item.icon.height } : undefined,
      })),
  }));

  return (
    <PanelFrame name="decision-tree" data={data} panel={panel}>
      {cards.length > 0 && <DecisionTreeClient cards={cards} />}
    </PanelFrame>
  );
}
