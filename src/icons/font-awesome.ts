/**
 * Font Awesome as an icon set, from any of its SVG icon packages: the free
 * ones (`@fortawesome/free-solid-svg-icons`, …) or Pro, which a site
 * installs with its own Font Awesome token. Cera doesn't ship Font Awesome:
 * Pro is licensed to each subscriber, so the site brings the package.
 *
 *   import { fas } from '@fortawesome/pro-solid-svg-icons';
 *   const faSolid = fontAwesomeIcons({ name: 'fa-solid', label: 'Font Awesome Solid', icons: fas });
 *   createIconLibrary([customIcons, lucideIcons, faSolid]);
 *
 * Use one set per style (solid, regular, light, duotone…), each with its own
 * name, since the same icon name looks different in each. Values look like
 * `fa-solid:house`. Search matches icon names and their aliases (the
 * packages don't carry Font Awesome's search keywords).
 */
import { attr, iconLabel, matchScore, queryWords, type IconGlyph, type IconSet } from './library.ts';

/** The shape of an icon in Font Awesome's `*-svg-icons` packages. */
export interface FontAwesomeIcon {
  prefix: string;
  iconName: string;
  /** [width, height, aliases, unicode, path data (two paths, secondary first, for duotone)] */
  icon: [number, number, Array<string | number>, string, string | string[]];
}

export function fontAwesomeIcons(opts: { name: string; label: string; icons: Record<string, FontAwesomeIcon> | readonly FontAwesomeIcon[] }): IconSet {
  // Packages export each icon under several names (faHouse, faHome): keep one per iconName.
  const byName = new Map<string, FontAwesomeIcon>();
  for (const def of Object.values(opts.icons)) {
    if (def && typeof def === 'object' && typeof def.iconName === 'string' && Array.isArray(def.icon)) byName.set(def.iconName, def);
  }
  const names = [...byName.keys()].sort();

  const glyph = (name: string): IconGlyph => {
    const [width, height, , , path] = byName.get(name)!.icon;
    const paths = Array.isArray(path)
      ? `<path d="${attr(path[0] ?? '')}" opacity="0.4"/><path d="${attr(path[1] ?? '')}"/>`
      : `<path d="${attr(path)}"/>`;
    return { value: `${opts.name}:${name}`, label: iconLabel(name), svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="currentColor">${paths}</svg>` };
  };

  return {
    name: opts.name,
    label: opts.label,
    search(query, limit) {
      const words = queryWords(query);
      const scored: Array<[number, string]> = [];
      for (const name of names) {
        const aliases = byName.get(name)!.icon[2].filter((alias): alias is string => typeof alias === 'string');
        const score = matchScore(name, aliases, words);
        if (score !== null) scored.push([score, name]);
      }
      scored.sort((first, second) => first[0] - second[0] || first[1].localeCompare(second[1]));
      return scored.slice(0, limit).map(([, name]) => glyph(name));
    },
    get(wanted) {
      return wanted.filter((name) => byName.has(name)).map(glyph);
    },
  };
}
