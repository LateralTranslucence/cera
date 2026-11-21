/**
 * The bundled icon set: Lucide (https://lucide.dev, ISC license), from the
 * `lucide-static` package's icon data. Values look like `lucide:arrow-right`.
 *
 * The data (about 1.4 MB of JSON for 2,300 icons and their search keywords)
 * loads on the server the first time an icon is searched for or drawn, and
 * never reaches the browser: pages get only the SVG of the icons they use.
 */
import { attr, iconLabel, matchScore, queryWords, type IconGlyph, type IconSet } from './library.ts';

type IconNode = Array<[string, Record<string, string | number>]>;

let data: Promise<{ nodes: Record<string, IconNode>; tags: Record<string, string[]>; names: string[] }> | undefined;

function load() {
  data ??= Promise.all([
    import('lucide-static/icon-nodes.json', { with: { type: 'json' } }),
    import('lucide-static/tags.json', { with: { type: 'json' } }),
  ]).then(([nodes, tags]) => {
    const n = (nodes.default ?? nodes) as unknown as Record<string, IconNode>;
    const t = (tags.default ?? tags) as unknown as Record<string, string[]>;
    return { nodes: n, tags: t, names: Object.keys(n).sort() };
  });
  return data;
}

/** Lucide's own attributes, as in its SVG files (less the fixed size, which CSS sets). */
function toSvg(node: IconNode): string {
  const children = node.map(([tag, attrs]) => `<${tag}${Object.entries(attrs).map(([k, v]) => ` ${k}="${attr(v)}"`).join('')}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
}

const glyph = (name: string, node: IconNode): IconGlyph => ({ value: `lucide:${name}`, label: iconLabel(name), svg: toSvg(node) });

export const lucideIcons: IconSet = {
  name: 'lucide',
  label: 'Lucide',

  async search(query, limit) {
    const { nodes, tags, names } = await load();
    const words = queryWords(query);
    const scored: Array<[number, string]> = [];
    for (const name of names) {
      const score = matchScore(name, tags[name] ?? [], words);
      if (score !== null) scored.push([score, name]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
    return scored.slice(0, limit).map(([, name]) => glyph(name, nodes[name]!));
  },

  async get(names) {
    const { nodes } = await load();
    return names.filter((n) => Object.hasOwn(nodes, n)).map((n) => glyph(n, nodes[n]!));
  },
};
