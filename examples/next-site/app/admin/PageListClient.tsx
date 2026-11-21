'use client';
/** Client wrapper: PageList takes a function for each row's link, which can't come from a Server Component. */
import { PageList } from '@lateraltranslucence/cera/admin';
import type { PageSummary } from '@lateraltranslucence/cera/supabase';

export function PageListClient({ pages }: { pages: PageSummary[] }) {
  return <PageList pages={pages} editHref={(page) => `/admin/pages/${page.id}`} />;
}
