/**
 * The admin's icons: 24×24 stroke drawings (1.75 stroke, round caps and
 * joins) that take their color from CSS `color`. Always decorative
 * (aria-hidden): the control they sit in carries the label.
 */
import type { ReactNode } from 'react';

const PATHS = {
  pages: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </>
  ),
  media: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5-9 9" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  signOut: (
    <>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 8l-4 4 4 4" />
      <path d="M6 12h10" />
    </>
  ),
  site: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3 3.9" />
      <path d="M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3 3l18 18" />
    </>
  ),
  duplicate: (
    <>
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13" />
      <path d="M9 7V4h6v3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  form: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </>
  ),
  article: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </>
  ),
  shapes: (
    <>
      <circle cx="7.5" cy="7.5" r="3.5" />
      <path d="M16.5 3.5l4 7h-8z" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" />
      <path d="M3.5 20.5l4-7 4 7z" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 13l2.5-8h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M3 13h5l1.5 3h5L16 13h5" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" />
      <path d="M3.5 3.5v5h5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, strokeWidth = 1.75 }: { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg
      className="cera-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Six dots: the drag handle. */
export function GripIcon() {
  return (
    <svg className="cera-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      {[6, 12, 18].map((y) => [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />))}
    </svg>
  );
}

const PETALS: Array<[number, number, number]> = [
  [51, 32, 7], [41.5, 48.45, 7], [22.5, 48.45, 7], [13, 32, 7], [22.5, 15.55, 7], [41.5, 15.55, 7],
  [49.32, 42, 6], [32, 52, 6], [14.68, 42, 6], [14.68, 22, 6], [32, 12, 6], [49.32, 22, 6],
];

/**
 * The Cera seal: honey wax pressed with a ring and a C. The full seal is for
 * 32px and up; `small` (no ring, heavier C) for 24px and below.
 */
export function CeraSeal({ size = 30, small = size <= 24, label = 'Cera' }: { size?: number; small?: boolean; label?: string | null }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })} focusable="false">
      <g fill="#E2A11B">
        <circle cx="32" cy="32" r="22" />
        {PETALS.map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
      {small ? (
        <path d="M38.01 25.99A8.5 8.5 0 1 0 38.01 38.01" fill="none" stroke="#1C1A16" strokeWidth="5.6" strokeLinecap="round" />
      ) : (
        <>
          <circle cx="32" cy="32" r="17.4" fill="none" stroke="#1C1A16" strokeWidth="2.4" />
          <path d="M37.52 26.48A7.8 7.8 0 1 0 37.52 37.52" fill="none" stroke="#1C1A16" strokeWidth="3.8" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** The seal and the "cera" wordmark, linking home. */
export function CeraLockup({ href, size = 30 }: { href: string; size?: number }) {
  return (
    <a href={href} className="cera-lockup">
      <CeraSeal size={size} />
      <span className="cera-lockup__name" aria-hidden="true">
        cera
      </span>
    </a>
  );
}
