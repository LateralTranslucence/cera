/** An id for in-page links, like WordPress's sanitize_title_with_dashes: "Our Team" → "our-team". */
export function slugForId(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
