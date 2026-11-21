/**
 * Shared panel fields — the successor to `set_panel_default_fields()`.
 * Spread into a panel's `fields`; use `omit()` where the theme passed `$unset`
 * (e.g. featured-post drops Title/Background/Copy).
 */
import { field } from './fields.ts';

export const panelDefaults = {
  title: field.text({ label: 'Title' }),
  background: field.background({ label: 'Background', note: 'Can be an image or video (.mp4).' }),
  copy: field.html({ label: 'Copy' }),
  // TODO(verify): the theme's 'ID' (varchar) — assumed to be an anchor id for in-page links.
  anchorId: field.text({ label: 'ID', note: 'Anchor id for in-page links (no #).' }),
};

export function omit<Source extends object, Key extends keyof Source>(obj: Source, ...keys: Key[]): Omit<Source, Key> {
  const out = { ...obj };
  for (const key of keys) delete out[key];
  return out;
}
