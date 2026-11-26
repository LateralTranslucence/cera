import type { CTA } from '../fields.ts';
import { safeHref } from '../links.ts';

/**
 * The href for an address an editor typed, or undefined for none (empty or
 * unsafe). Theme note on CTA: "For internal links, only include the path."
 */
export const linkHref = safeHref;

/** A call to action as a link. One without a usable address isn't shown. */
export function CtaLink({ cta }: { cta: CTA }) {
  // TODO: target 'modal' needs a client component; it opens normally for now.
  const href = linkHref(cta.url);
  if (!href) return null;
  const external = cta.target === '_blank';
  return (
    <a className={`cta${cta.style ? ` cta--${cta.style}` : ''}`} href={href} {...(external && { target: '_blank', rel: 'noopener noreferrer' })}>
      {cta.text}
    </a>
  );
}

export function CtaLinks({ ctas }: { ctas: CTA[] }) {
  if (!ctas.some((cta) => linkHref(cta.url))) return null;
  return (
    <p className="ctas">
      {ctas.map((cta, i) => (
        <CtaLink key={i} cta={cta} />
      ))}
    </p>
  );
}
