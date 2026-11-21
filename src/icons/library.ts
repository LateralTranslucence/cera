/**
 * Icon sets and the library that combines them (decision 21).
 *
 * An `field.icon()` field stores `set:name`: `lucide:arrow-right` for the bundled
 * Lucide set, `custom:<id>` for a site's own icon (the Icon content type),
 * or any prefix a site's own set uses (e.g. `fa-solid:house` for Font
 * Awesome). The prefix keeps stored values meaning the same icon when sets
 * are added later.
 *
 * Every set returns ready SVG markup, so a page renders an icon without a
 * client-side library: inline, sized by CSS, colored by `currentColor`.
 */

export interface IconGlyph {
  /** What an `field.icon()` field stores, e.g. `lucide:arrow-right`. */
  value: string;
  /** A readable name, e.g. "Arrow right". */
  label: string;
  /** SVG markup that's safe to inline: from trusted code, or cleaned (custom icons). */
  svg: string;
  /** Shown in the admin's picker, e.g. "Not published". */
  note?: string;
}

export interface IconSet {
  /** The prefix in stored values: lowercase letters, digits and dashes. */
  name: string;
  /** Shown in the admin's picker, e.g. "Lucide". */
  label: string;
  /**
   * Icons whose name or keywords match every word in `query`, best first, at
   * most `limit`. With an empty query, the first `limit` icons.
   */
  search(query: string, limit: number): IconGlyph[] | Promise<IconGlyph[]>;
  /** The icons with these names (the part after the prefix). Unknown names are left out. */
  get(names: readonly string[]): IconGlyph[] | Promise<IconGlyph[]>;
}

/** What panels' `load` uses to turn stored values into icons (LoadContext.icons). */
export interface IconResolver {
  /** Resolved icons by stored value. Values that don't resolve (unknown set or icon, deleted, not live) are missing. */
  byValues(values: readonly string[]): Promise<Map<string, IconGlyph>>;
}

export interface IconLibrary extends IconResolver {
  sets: ReadonlyArray<{ name: string; label: string }>;
  /** Matches from every set (or just `set`), `limit` per set, in the library's set order. */
  search(query: string, options?: { limit?: number; set?: string }): Promise<IconGlyph[]>;
}

const SET_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `lucide:arrow-right` → { set: 'lucide', name: 'arrow-right' }; null when it isn't `set:name`. */
export function parseIconValue(value: string): { set: string; name: string } | null {
  const colonIndex = value.indexOf(':');
  if (colonIndex <= 0 || colonIndex === value.length - 1) return null;
  const set = value.slice(0, colonIndex);
  return SET_NAME.test(set) ? { set, name: value.slice(colonIndex + 1) } : null;
}

/** Combines icon sets. Order matters: the admin's picker shows them in this order. */
export function createIconLibrary(sets: readonly IconSet[]): IconLibrary {
  const byName = new Map<string, IconSet>();
  for (const iconSet of sets) {
    if (!SET_NAME.test(iconSet.name)) throw new Error(`cera: icon set name "${iconSet.name}" must be lowercase letters, digits and dashes.`);
    if (byName.has(iconSet.name)) throw new Error(`cera: two icon sets are named "${iconSet.name}".`);
    byName.set(iconSet.name, iconSet);
  }

  return {
    sets: sets.map((iconSet) => ({ name: iconSet.name, label: iconSet.label })),

    async search(query, options = {}) {
      const limit = Math.min(Math.max(options.limit ?? 48, 1), 200);
      const chosen = options.set ? sets.filter((iconSet) => iconSet.name === options.set) : sets;
      const found = await Promise.all(chosen.map((iconSet) => Promise.resolve(iconSet.search(query.trim(), limit)).then((matches) => matches.slice(0, limit))));
      return found.flat();
    },

    async byValues(values) {
      const wanted = new Map<string, Set<string>>();
      for (const value of new Set(values)) {
        const parsed = typeof value === 'string' ? parseIconValue(value) : null;
        if (!parsed || !byName.has(parsed.set)) continue;
        if (!wanted.has(parsed.set)) wanted.set(parsed.set, new Set());
        wanted.get(parsed.set)!.add(parsed.name);
      }
      const out = new Map<string, IconGlyph>();
      await Promise.all(
        [...wanted].map(async ([set, names]) => {
          for (const glyph of await byName.get(set)!.get([...names])) out.set(glyph.value, glyph);
        }),
      );
      return out;
    },
  };
}

/** "arrow-right" → "Arrow right". */
export function iconLabel(name: string): string {
  const words = name.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** For sets' `search`: scores a name and its keywords against the query words; null when a word doesn't match. */
export function matchScore(name: string, keywords: readonly string[], words: readonly string[]): number | null {
  if (words.length === 0) return 3;
  const query = words.join('-');
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  const parts = name.split('-');
  let score = 2;
  for (const word of words) {
    if (parts.some((part) => part.startsWith(word))) continue;
    if (name.includes(word)) continue;
    // Keywords match at the start of a word: "rocket" finds "rocket science", not "sprocket".
    if (keywords.some((keyword) => keyword.split(/[\s-]+/).some((part) => part.startsWith(word)))) {
      score = 3;
      continue;
    }
    return null;
  }
  return score;
}

/** Lowercase query words, for `matchScore`. */
export function queryWords(query: string): string[] {
  return query.toLowerCase().split(/[\s,]+/).filter(Boolean);
}

/** Escapes an SVG attribute value. */
export function escapeAttribute(value: string | number): string {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
