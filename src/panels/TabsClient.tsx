'use client';
/**
 * Accessible tabs (WAI-ARIA tabs pattern, as in the theme's shared Tabs):
 * arrow keys move between tabs and select them, wrapping at the ends; Home and
 * End jump to the first and last. Every tab's content is in the HTML (inactive
 * ones are `hidden`), so it's indexed and works before the script loads. A link
 * to #<tab id> opens that tab.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { CTA } from '../fields.ts';
import { CtaLink } from './CtaLinks.tsx';
import { Html } from './Html.tsx';

export interface TabItem {
  id: string;
  navLabel: string;
  title?: string;
  copy?: string;
  cta?: CTA;
  media?: { kind: 'image' | 'video'; src: string; alt: string; width?: number; height?: number };
}

export function TabsClient({ items, baseId }: { items: TabItem[]; baseId: string }) {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Open the tab a link points at, now and when the hash changes.
  useEffect(() => {
    const fromHash = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      const index = hash ? items.findIndex((tab) => tab.id === hash) : -1;
      if (index > -1) setActive(index);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [items]);

  const select = (index: number, focus: boolean) => {
    const next = (index + items.length) % items.length;
    setActive(next);
    if (focus) tabRefs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, i: number) => {
    const moves: Record<string, number> = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 };
    if (event.key in moves) {
      event.preventDefault();
      select(moves[event.key]!, true);
    }
  };

  return (
    <div className="tabs">
      <div role="tablist" className="tabs__nav" aria-orientation="horizontal">
        {items.map((tab, i) => (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[i] = element;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={i === active}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={i === active ? 0 : -1}
            className="tabs__tab"
            onClick={() => select(i, false)}
            onKeyDown={(event) => onKeyDown(event, i)}
          >
            {tab.navLabel}
          </button>
        ))}
      </div>
      {items.map((tab, i) => (
        <div
          key={tab.id}
          id={`${baseId}-panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          tabIndex={0}
          hidden={i !== active}
          className="tabs__panel"
        >
          {/* The in-page link target. */}
          <span id={tab.id} className="tabs__anchor" />
          {tab.media &&
            (tab.media.kind === 'video' ? (
              <video className="tabs__media" src={tab.media.src} controls playsInline preload="metadata" />
            ) : (
              <img className="tabs__media" src={tab.media.src} alt={tab.media.alt} width={tab.media.width} height={tab.media.height} loading="lazy" />
            ))}
          <div className="tabs__text">
            {tab.title && <h3>{tab.title}</h3>}
            {tab.copy && <Html html={tab.copy} />}
            {tab.cta && (
              <p className="ctas">
                <CtaLink cta={tab.cta} />
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
