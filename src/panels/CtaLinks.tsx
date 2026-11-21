import type { CTA } from '../fields.ts';

/** Theme note on CTA: "For internal links, only include the path." */
export function linkHref(url: string): string {
  return /^([a-z]+:|\/|#)/i.test(url) ? url : `/${url}`;
}

export function CtaLink({ cta }: { cta: CTA }) {
  // TODO: target 'modal' needs a client component; it opens normally for now.
  const external = cta.target === '_blank';
  return (
    <a className={`cta${cta.style ? ` cta--${cta.style}` : ''}`} href={linkHref(cta.url)} {...(external && { target: '_blank', rel: 'noopener noreferrer' })}>
      {cta.text}
    </a>
  );
}

export function CtaLinks({ ctas }: { ctas: CTA[] }) {
  if (ctas.length === 0) return null;
  return (
    <p className="ctas">
      {ctas.map((cta, i) => (
        <CtaLink key={i} cta={cta} />
      ))}
    </p>
  );
}
