/**
 * Shared panel fields — the successor to `set_panel_default_fields()`.
 * Spread into a panel's `fields`; use `omit()` where the theme passed `$unset`
 * (e.g. featured-post drops Title/Background/Copy).
 */
import { f } from './fields.ts';

export const panelDefaults = {
  title: f.text({ label: 'Title' }),
  background: f.background({ label: 'Background', note: 'Can be an image or video (.mp4).' }),
  copy: f.html({ label: 'Copy' }),
  // TODO(verify): the theme's 'ID' (varchar) — assumed to be an anchor id for in-page links.
  anchorId: f.text({ label: 'ID', note: 'Anchor id for in-page links (no #).' }),
};

export function omit<T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
}
