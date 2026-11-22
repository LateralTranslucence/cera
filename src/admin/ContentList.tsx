'use client';
/**
 * A content type's list in the admin (createAdminScreens' list screen): the
 * PageList with links built from strings, so a Server Component can render
 * it. Forms get a column of their submissions, icons one showing each icon.
 */
import type { PageSummary } from '../supabase/index.ts';
import { PageList } from './PageList.tsx';

export interface ContentListProps {
  pages: PageSummary[];
  /** The editor's address without the page ID, e.g. `/admin/simple-pages`. */
  base: string;
  noun: string;
  nounPlural: string;
  /** Heading for the panel count, or null for types without panels. */
  countLabel: string | null;
  /** The type's public route (`/[slug]`, `/guides/[slug]`), shown as each page's address. Without one, slugs show as IDs. */
  route?: string;
  /** Icons: each one's cleaned SVG, by page ID (from supabaseIcons, safe to inline). */
  previews?: Record<string, string>;
  /** Forms: each one's submissions, by page ID, and where a form's submissions are listed. */
  submissions?: { counts: Record<string, number>; href: string };
}

export function ContentList({ pages, base, noun, nounPlural, countLabel, route, previews, submissions }: ContentListProps) {
  return (
    <PageList
      pages={pages}
      editHref={(page) => `${base}/${page.id}`}
      noun={noun}
      nounPlural={nounPlural}
      countLabel={countLabel}
      slugs={route ? 'path' : 'id'}
      {...(route && { pathOf: (page: PageSummary) => (page.slug === 'home' && route === '/[slug]' ? '/' : route.replace('[slug]', page.slug)) })}
      {...(previews && {
        extra: {
          label: 'Icon',
          render: (page: PageSummary) => (previews[page.id] ? <span className="cera-icon-glyph" aria-hidden="true" dangerouslySetInnerHTML={{ __html: previews[page.id]! }} /> : '—'),
        },
      })}
      {...(submissions && {
        extra: {
          label: 'Submissions',
          render: (page: PageSummary) => {
            const total = submissions.counts[page.id] ?? 0;
            return total > 0 ? <a href={`${submissions.href}${encodeURIComponent(page.id)}`}>{total}</a> : '0';
          },
        },
      })}
    />
  );
}
