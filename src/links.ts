/**
 * Which links Cera stores and renders. Editors type addresses into CTAs, URL
 * fields, image links and menus; a `javascript:` (or `data:`, `vbscript:`…)
 * address would run or load something when clicked, so those are refused
 * when a page is published and dropped when one is rendered.
 */

/** Schemes a link may use. Anything without a scheme is a path on this site. */
export const SAFE_LINK_SCHEMES: readonly string[] = ['http', 'https', 'mailto', 'tel'];

export const UNSAFE_LINK_MESSAGE = 'Use a web address (https://…), a path on this site (/about), an anchor (#team), mailto: or tel:.';

/**
 * The address as a browser reads it: ASCII tabs and newlines anywhere are
 * ignored, as are control characters and spaces at either end. So
 * "java\tscript:" and " javascript:" are still javascript:.
 */
function asBrowsersRead(url: string): string {
  return url.replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+|[\u0000- ]+$/g, '');
}

/** The link's scheme in lowercase ("https", "javascript"), or null for a path. */
export function linkScheme(url: string): string | null {
  return /^([a-z][a-z0-9+.-]*):/i.exec(asBrowsersRead(url))?.[1]?.toLowerCase() ?? null;
}

/**
 * Whether an address is safe to link to: empty (no link), a path, an anchor
 * or a query, or one of SAFE_LINK_SCHEMES. An address with a tab, newline
 * or other control character inside it is refused.
 */
export function isSafeLink(url: string): boolean {
  // Nobody types a tab, newline or other control character into an address on purpose.
  if (/[\u0000-\u001f\u007f]/.test(url.trim())) return false;
  const scheme = linkScheme(url);
  return scheme === null || SAFE_LINK_SCHEMES.includes(scheme);
}

/**
 * The href for an address an editor typed, or undefined when there's no
 * link: empty, or unsafe. A bare path gets a leading slash (theme note on
 * CTAs: "For internal links, only include the path").
 */
export function safeHref(url: string | undefined | null): string | undefined {
  const read = asBrowsersRead(url ?? '');
  if (!read || !isSafeLink(read)) return undefined;
  return /^([a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(read) ? read : `/${read}`;
}
