/**
 * Renders a rich-text field.
 *
 * SECURITY: this trusts the stored HTML. Only admins and editors can write
 * pages, but Cera still has to sanitize `f.html()` values on save (allowlist
 * per toolbar) before this is safe for real sites. Tracked in HANDOFF.md.
 */
export function Html({ html, className = 'rich-text' }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
