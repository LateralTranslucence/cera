'use client';
/**
 * The WAI-ARIA accordion pattern, as in the theme: one item open at a time;
 * arrow keys move between headers (wrapping), Home and End jump to the first
 * and last. The text is in the HTML either way; closed items are `hidden`.
 */
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Html } from './Html.tsx';

export interface AccordionItem {
  id: string;
  title: string;
  text?: string;
}

export function AccordionClient({ items }: { items: AccordionItem[] }) {
  const baseId = useId();
  const [open, setOpen] = useState<number | null>(null);
  const triggers = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const last = items.length - 1;
    const moves: Record<string, number> = { ArrowDown: i === last ? 0 : i + 1, ArrowUp: i === 0 ? last : i - 1, Home: 0, End: last };
    if (e.key in moves) {
      e.preventDefault();
      triggers.current[moves[e.key]!]?.focus();
    }
  };

  return (
    <ul className="accordion">
      {items.map((item, i) => {
        const isOpen = open === i;
        const triggerId = `${baseId}-trigger-${i}`;
        const regionId = `${baseId}-panel-${i}`;
        return (
          <li key={item.id} className={`accordion__item${isOpen ? ' is-open' : ''}`}>
            <h3 className="accordion__header">
              <button
                ref={(el) => {
                  triggers.current[i] = el;
                }}
                type="button"
                id={triggerId}
                className="accordion__trigger"
                aria-expanded={isOpen}
                aria-controls={regionId}
                onClick={() => setOpen(isOpen ? null : i)}
                onKeyDown={(e) => onKeyDown(e, i)}
              >
                <span>{item.title}</span>
                <span className="accordion__icon" aria-hidden="true" />
              </button>
            </h3>
            {item.text && (
              <div id={regionId} role="region" aria-labelledby={triggerId} className="accordion__panel" hidden={!isOpen}>
                <Html html={item.text} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
