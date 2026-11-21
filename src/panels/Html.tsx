/**
 * Renders a rich-text field.
 *
 * The HTML is trusted because Cera sanitizes every `field.html()` value when a
 * page is saved (`preparePageForSave`), and browsers can't write pages
 * directly (all saves go through the server). Content written to the
 * database some other way would bypass that, so don't.
 */
export function Html({ html, className = 'rich-text' }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
