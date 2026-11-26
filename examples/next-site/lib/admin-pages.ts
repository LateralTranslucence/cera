import 'server-only';
import { readPage, roleAtLeast, type PageOf, type StoredPage } from '@lateraltranslucence/cera';
import { adminPage } from '../cera/index.ts';
import type { Staff } from './auth.ts';

type AdminPage = PageOf<typeof adminPage>;

/**
 * The admin pages this person may read (their role meets the page's
 * Permissions), as working copies: admin pages are never published. Sorted
 * by Menu Position, then name.
 */
export async function readableAdminPages(staff: Staff): Promise<AdminPage[]> {
  const { data, error } = await staff.client.from('cera_pages').select('id, slug, title, boxes').eq('content_type', adminPage.name);
  if (error) throw error;
  const pages = ((data ?? []) as Array<Pick<StoredPage, 'id' | 'slug' | 'title' | 'boxes'>>).map(
    (row) => readPage(adminPage, { ...row, contentType: adminPage.name, panels: [] }, { status: 'draft' }).page,
  );
  return pages
    .filter((page) => roleAtLeast(staff.role, page.boxes.settings.readers))
    .sort((first, second) => (first.boxes.settings.menuPosition ?? 999) - (second.boxes.settings.menuPosition ?? 999) || first.title.localeCompare(second.title));
}
