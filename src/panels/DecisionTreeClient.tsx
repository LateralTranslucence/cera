'use client';
/**
 * Opens one card at a time. Each card has an Expand and a Close button and
 * only one shows, so focus moves to the other when it's pressed (as in the
 * theme). The details are in the HTML either way; closed ones are `hidden`.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { CTA } from '../fields.ts';
import { CtaLink } from './CtaLinks.tsx';
import { Html } from './Html.tsx';

export interface DecisionCard {
  id: string;
  title?: string;
  overview?: string;
  copy?: string;
  cta?: CTA;
  list: Array<{ id: string; title: string; url: string; icon?: { src: string; width?: number; height?: number } }>;
}

export function DecisionTreeClient({ cards }: { cards: DecisionCard[] }) {
  const baseId = useId();
  const [open, setOpen] = useState<number | null>(null);
  const expandRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const closeRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusNext = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    focusNext.current?.focus();
    focusNext.current = null;
  }, [open]);

  return (
    <ul className={`decision-tree${open === null ? '' : ` decision-tree--open-${open}`}`}>
      {cards.map((card, i) => {
        const isOpen = open === i;
        const detailId = `${baseId}-detail-${i}`;
        return (
          <li key={card.id} className={`decision-tree__card${isOpen ? ' is-open' : ''}`}>
            {card.title && <h3>{card.title}</h3>}
            {card.overview && <Html html={card.overview} className="rich-text decision-tree__overview" />}
            <div id={detailId} className="decision-tree__detail" hidden={!isOpen}>
              {card.copy && <Html html={card.copy} />}
              {card.cta && (
                <p className="ctas">
                  <CtaLink cta={card.cta} />
                </p>
              )}
              {card.list.length > 0 && (
                <ul className="decision-tree__list">
                  {card.list.map((item) => (
                    <li key={item.id}>
                      <a href={item.url}>
                        {item.icon && <img src={item.icon.src} alt="" width={item.icon.width} height={item.icon.height} loading="lazy" />}
                        <span>{item.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              className="decision-tree__toggle"
              aria-controls={detailId}
              aria-expanded={isOpen}
              hidden={isOpen}
              ref={(element) => {
                expandRefs.current[i] = element;
              }}
              onClick={() => {
                focusNext.current = closeRefs.current[i] ?? null;
                setOpen(i);
              }}
            >
              Expand<span className="visually-hidden">: {card.title}</span>
            </button>
            <button
              type="button"
              className="decision-tree__toggle"
              aria-controls={detailId}
              aria-expanded={isOpen}
              hidden={!isOpen}
              ref={(element) => {
                closeRefs.current[i] = element;
              }}
              onClick={() => {
                focusNext.current = expandRefs.current[i] ?? null;
                setOpen(null);
              }}
            >
              Close<span className="visually-hidden">: {card.title}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
