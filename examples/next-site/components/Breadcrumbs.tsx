import type { Breadcrumb } from '@lateraltranslucence/cera';

/**
 * A page's breadcrumb trail (breadcrumbsFor): the content type's crumbs, the
 * page's own, then the page itself, which isn't a link. Nothing when the
 * page is the whole trail.
 */
export function Breadcrumbs({ trail }: { trail: Breadcrumb[] }) {
  if (trail.length < 2) return null;
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {trail.map((crumb, i) => (
          <li key={`${i}-${crumb.url}`}>
            {i === trail.length - 1 ? (
              <span aria-current="page">{crumb.text}</span>
            ) : !crumb.url ? (
              <span>{crumb.text}</span>
            ) : (
              <a href={crumb.url}>{crumb.text}</a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
