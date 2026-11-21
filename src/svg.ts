/**
 * SVG cleaning for `field.svg()` fields (custom icons). Runs on save (see
 * `preparePageForSave`) and again when icons are read for rendering, so
 * stored markup is always safe to put in a page.
 *
 * An SVG is a document that can run scripts, load other files and embed
 * HTML. Only drawing is kept: shapes, groups, gradients, clip paths and
 * masks, with presentation attributes and the matching inline styles. Gone:
 * scripts, event handlers, <foreignObject>, <style>, <image>, <use>, links,
 * and any reference to something outside the file (`url(…)` must point
 * inside it, at `#id`).
 *
 * Then, like the theme's DO_Icon::onsave: black fills and strokes become
 * `currentColor`, and the root gets `fill="currentColor"` when it has none,
 * so the icon takes the color of the text around it. The root's width and
 * height go (CSS sizes it); a viewBox is made from them when it has none.
 *
 * Imported lazily, like sanitize.ts, to keep the library out of client
 * bundles.
 */
import sanitizeHtml, { type IOptions } from 'sanitize-html';
import { MAX_SVG_LENGTH } from './fields.ts';

const TAGS = [
  'svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect',
  'defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'title', 'desc',
];

const PRESENTATION = [
  'fill', 'fill-opacity', 'fill-rule', 'clip-rule', 'clip-path', 'mask', 'opacity',
  'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity',
  'stop-color', 'stop-opacity', 'transform', 'vector-effect', 'shape-rendering',
];

const GEOMETRY = ['x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'd', 'points', 'pathLength'];

/** A CSS value with no `url(` except `url(#id)`, no `expression(` and nothing that ends the declaration. */
const SAFE_VALUE = /^(?!.*(?:url\s*\((?!\s*['"]?#)|expression\s*\(|[;{}<>\\])).*$/is;

const STYLE_PROPERTIES = Object.fromEntries(PRESENTATION.filter((property) => property !== 'transform').map((property) => [property, [SAFE_VALUE]]));

const OPTIONS: IOptions = {
  allowedTags: TAGS,
  allowedAttributes: {
    svg: ['viewBox', 'width', 'height', 'xmlns', 'preserveAspectRatio', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'role', 'aria-hidden'],
    clipPath: ['clipPathUnits'],
    mask: ['maskUnits', 'maskContentUnits'],
    linearGradient: ['gradientUnits', 'gradientTransform', 'spreadMethod'],
    radialGradient: ['gradientUnits', 'gradientTransform', 'spreadMethod'],
    stop: ['offset'],
    '*': ['id', 'style', ...PRESENTATION, ...GEOMETRY],
  },
  allowedStyles: { '*': STYLE_PROPERTIES },
  // SVG is XML: keep the case of viewBox, clipPath and linearGradient, and self-closing tags.
  parser: { xmlMode: true, lowerCaseTags: false, lowerCaseAttributeNames: false },
  // Disallowed tags go, keeping their content; these go with their content.
  disallowedTagsMode: 'discard',
  nonTextTags: ['script', 'style', 'foreignObject', 'textarea', 'option', 'noscript'],
  // Presentation attributes may point at gradients and clip paths in the file, never elsewhere.
  transformTags: {
    '*': (tagName, attribs) => {
      const out: Record<string, string> = {};
      for (const [name, value] of Object.entries(attribs)) {
        if (/url\s*\(/i.test(value) && !/^\s*url\(\s*['"]?#[\w-]+['"]?\s*\)\s*$/i.test(value)) continue;
        out[name] = value;
      }
      return { tagName, attribs: out };
    },
  },
};

/** Everything allowed: used only to tell whether cleaning removed anything. */
const NORMALIZE: IOptions = {
  allowedTags: false,
  allowedAttributes: false,
  allowVulnerableTags: true,
  parser: { xmlMode: true, lowerCaseTags: false, lowerCaseAttributeNames: false },
};

const BLACK = String.raw`(?:#(?:000000|000)|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))`;

/** The theme's replace_with_current_color, plus the root's size and viewBox. */
function finish(svg: string): string {
  let out = svg
    .replace(new RegExp(String.raw`\b(fill|stroke)="${BLACK}"`, 'gi'), '$1="currentColor"')
    .replace(new RegExp(String.raw`\b(fill|stroke)\s*:\s*${BLACK}`, 'gi'), '$1:currentColor');
  out = out.replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
    let attributes = attrs;
    const width = /\swidth="([\d.]+)(?:px)?"/.exec(attributes)?.[1];
    const height = /\sheight="([\d.]+)(?:px)?"/.exec(attributes)?.[1];
    attributes = attributes.replace(/\s(?:width|height)="[^"]*"/g, '');
    if (!/\sviewBox="/.test(attributes) && width && height) attributes += ` viewBox="0 0 ${width} ${height}"`;
    if (!/\sxmlns="/.test(attributes)) attributes += ' xmlns="http://www.w3.org/2000/svg"';
    if (!/\sfill="/.test(attributes)) attributes += ' fill="currentColor"';
    return `<svg${attributes}>`;
  });
  return out.trim();
}

export type SvgResult = { svg: string; removed: boolean } | { svg: ''; removed: false; error: string };

/**
 * Cleans an uploaded SVG. `removed` is true when anything in it was taken
 * out (not counting the color and size changes); `error` when it isn't a
 * usable SVG at all.
 */
export function cleanSvg(input: string): SvgResult {
  const source = input.trim().replace(/^<\?xml[^>]*\?>/, '').replace(/<!DOCTYPE[^>]*>/i, '').trim();
  if (source.length > MAX_SVG_LENGTH) return { svg: '', removed: false, error: `The SVG is too large (over ${MAX_SVG_LENGTH.toLocaleString('en-US')} characters).` };
  const clean = sanitizeHtml(source, OPTIONS).trim();
  if (!/^<svg[\s>]/.test(clean) || !/<\/svg>$/.test(clean)) return { svg: '', removed: false, error: 'That isn’t an SVG file.' };
  if (!/<(?:path|circle|ellipse|line|polyline|polygon|rect)\b/.test(clean)) return { svg: '', removed: false, error: 'The SVG has nothing left to draw once cleaned.' };
  return { svg: finish(clean), removed: clean !== sanitizeHtml(source, NORMALIZE).trim() };
}

/** For stored icons: the cleaned SVG, or '' when it isn't usable. Cleaning again is a no-op for markup cleaned on save. */
export function safeSvg(stored: string): string {
  return cleanSvg(stored).svg;
}
