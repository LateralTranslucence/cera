'use client';
/**
 * One stat's number, counting from 0 (or down to 0) when it scrolls into view,
 * eased like the theme's useCountUp. It renders the final value first, so the
 * server's HTML is right; the count only runs for numbers still off screen
 * after the page loads, and never for people who prefer reduced motion.
 */
import { useEffect, useRef, useState } from 'react';

const DURATION = 2000;
const ease = (t: number) => 1 - (1 - t) ** 3; // ease-out cubic

export function format(n: number, decimal: boolean): string {
  return n.toLocaleString('en-US', decimal ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : { maximumFractionDigits: 0 });
}

export function StatCount({ value, decimal = false, countDown = false }: { value: number; decimal?: boolean; countDown?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const end = countDown ? 0 : value;
  const start = countDown ? value : 0;
  const [shown, setShown] = useState(end);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return; // already visible: keep the final value
    setShown(start);
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - t0) / DURATION, 1);
          setShown(start + (end - start) * ease(p));
          if (p < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [start, end]);

  // Screen readers get the final value, not every step of the count.
  return (
    <span ref={ref} className="stats__number" aria-label={format(end, decimal)}>
      <span aria-hidden="true">{format(shown, decimal)}</span>
    </span>
  );
}
