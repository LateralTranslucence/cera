'use client';
/**
 * A row of cards that scrolls sideways (CSS scroll snap, so it works without
 * the script), with Previous and Next buttons that move a row's width at a
 * time. The buttons turn off at the ends.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function PostsSlider({ perRow, label, children }: { perRow: number; label: string; children: ReactNode }) {
  const list = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const update = () => {
      setAtStart(element.scrollLeft <= 1);
      setAtEnd(element.scrollLeft + element.clientWidth >= element.scrollWidth - 1);
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      element.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const move = (direction: 1 | -1) => {
    const element = list.current;
    if (!element) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    element.scrollBy({ left: direction * element.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <div className="posts-slider" role="region" aria-label={label}>
      <ul ref={list} className="posts posts--slider" style={{ ['--per-row' as string]: perRow }}>
        {children}
      </ul>
      <div className="posts-slider__nav">
        <button type="button" onClick={() => move(-1)} disabled={atStart}>
          Previous
        </button>
        <button type="button" onClick={() => move(1)} disabled={atEnd}>
          Next
        </button>
      </div>
    </div>
  );
}
