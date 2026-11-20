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
      const i = hash ? items.findIndex((t) => t.id === hash) : -1;
      if (i > -1) setActive(i);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [items]);

  const select = (i: number, focus: boolean) => {
    const next = (i + items.length) % items.length;
    setActive(next);
    if (focus) tabRefs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const moves: Record<string, number> = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 };
    if (e.key in moves) {
      e.preventDefault();
      select(moves[e.key]!, true);
    }
  };

  return (
    <div className="tabs">
      <div role="tablist" className="tabs__nav" aria-orientation="horizontal">
        {items.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${t.id}`}
            aria-selected={i === active}
            aria-controls={`${baseId}-panel-${t.id}`}
            tabIndex={i === active ? 0 : -1}
            className="tabs__tab"
            onClick={() => select(i, false)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.navLabel}
          </button>
        ))}
      </div>
      {items.map((t, i) => (
        <div
          key={t.id}
          id={`${baseId}-panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${t.id}`}
          tabIndex={0}
          hidden={i !== active}
          className="tabs__panel"
        >
          {/* The in-page link target. */}
          <span id={t.id} className="tabs__anchor" />
          {t.media &&
            (t.media.kind === 'video' ? (
              <video className="tabs__media" src={t.media.src} controls playsInline preload="metadata" />
            ) : (
              <img className="tabs__media" src={t.media.src} alt={t.media.alt} width={t.media.width} height={t.media.height} loading="lazy" />
            ))}
          <div className="tabs__text">
            {t.title && <h3>{t.title}</h3>}
            {t.copy && <Html html={t.copy} />}
            {t.cta && (
              <p className="ctas">
                <CtaLink cta={t.cta} />
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
