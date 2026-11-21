// An icon from an icon set (see cera/icons), drawn inline so it takes the
// text color and is sized by CSS (font-size, or width on .cera-icon-glyph).
// The SVG comes from trusted set code or was cleaned (custom icons).
import type { IconGlyph as Glyph } from '../icons/library.ts';

/** Decorative unless `label` is given, which makes it an image with that name. */
export function IconGlyph({ glyph, label, className }: { glyph: Glyph; label?: string; className?: string }) {
  return (
    <span
      className={className ? `cera-icon-glyph ${className}` : 'cera-icon-glyph'}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      dangerouslySetInnerHTML={{ __html: glyph.svg }}
    />
  );
}
