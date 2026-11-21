'use client';
/**
 * Client wrapper for the lists of types without panels (simple pages,
 * icons): PageList takes a function for each row's link, which can't come
 * from a Server Component. Icons get a column showing each one.
 */
import { PageList } from '@lateraltranslucence/cera/admin';
import type { PageSummary } from '@lateraltranslucence/cera/supabase';
import { placeOf } from './content.ts';

export function ContentListClient({ pages, contentType, previews }: { pages: PageSummary[]; contentType: string; previews?: Record<string, string> }) {
  const place = placeOf(contentType);
  return (
    <PageList
      pages={pages}
      editHref={(page) => `${place.base}/${page.id}`}
      noun={place.noun}
      countLabel={null}
      slugs={place.section === 'icons' ? 'id' : 'path'}
      {...(previews && {
        extra: {
          label: 'Icon',
          // Cleaned SVG from the server (supabaseIcons), safe to inline.
          render: (page: PageSummary) => (previews[page.id] ? <span className="cera-icon-glyph" aria-hidden="true" dangerouslySetInnerHTML={{ __html: previews[page.id]! }} /> : '—'),
        },
      })}
    />
  );
}
