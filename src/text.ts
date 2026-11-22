/**
 * Plain text from rich text, for search engine descriptions, structured data
 * and the like. Block tags become spaces ("<p>One</p><p>Two</p>" → "One
 * Two"), inline ones just go ("<em>red</em>," → "red,"), and common entities
 * are decoded. With `maxLength`, the text is cut to exactly that many
 * characters (or fewer, when it's shorter).
 */
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function plainText(html: string | undefined | null, maxLength?: number): string {
  const text = (html ?? '')
    .replace(/<\/?(?:p|br|li|ul|ol|h[1-6]|div|blockquote|tr|td|th|figure|figcaption|hr)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (entity, decimal: string, hex: string, name: string) => {
      if (decimal) return String.fromCodePoint(Number(decimal));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return ENTITIES[name.toLowerCase()] ?? entity;
    })
    .replace(/\s+/g, ' ')
    .trim();
  return maxLength === undefined ? text : text.slice(0, maxLength);
}
