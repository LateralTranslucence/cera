// Content-type settings ported from the theme's settings(): who may edit a
// type (restrict_users), types that are never published, and breadcrumbs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breadcrumbsFor, canEditContentType, defineContentType, field, readPage, type StoredPage } from '../src/index.ts';
import { savePage } from '../src/supabase/index.ts';
import { landingPage } from '../examples/next-site/cera/content-types/landing-page.ts';
import { simplePage } from '../examples/next-site/cera/content-types/simple-page.ts';
import { adminPage } from '../examples/next-site/cera/content-types/admin-page.ts';
import { addUser, createTestDb, fakeSupabase } from './support/db.ts';

test('editRoles limits who may edit a type; admins and editors by default, viewers never', () => {
  const open = { editRoles: undefined };
  const adminsOnly = { editRoles: ['admin'] as const };
  assert.deepEqual(
    (['admin', 'editor', 'viewer', null] as const).map((role) => [canEditContentType(role, open), canEditContentType(role, adminsOnly)]),
    [
      [true, true],
      [true, false],
      [false, false],
      [false, false],
    ],
  );
  assert.equal(canEditContentType('viewer', { editRoles: ['viewer'] }), false);
  assert.equal(canEditContentType('editor', adminPage), false);
});

test('breadcrumbs: the type’s, then the page’s own, then the page; crumbs without text are dropped', () => {
  const raw: StoredPage = {
    id: crypto.randomUUID(),
    contentType: landingPage.name,
    slug: 'mars',
    title: 'Mars',
    boxes: { admin: { breadcrumbs: [{ _id: 'a', text: 'Planets', url: '/planets' }, { _id: 'b', text: '', url: '/x' }] } },
    panels: [],
  };
  const { page } = readPage(landingPage, raw);
  assert.deepEqual(breadcrumbsFor(landingPage, page), [
    { text: 'Planets', url: '/planets' },
    { text: 'Mars', url: '/mars' },
  ]);

  const simple = readPage(simplePage, { ...raw, contentType: simplePage.name, slug: 'policy', title: 'Policy', boxes: {} }).page;
  assert.deepEqual(breadcrumbsFor(simplePage, simple), [
    { text: 'Home', url: '/' },
    { text: 'Policy', url: '/policy' },
  ]);

  const noCrumbs = defineContentType({ name: 'plain', label: 'Plain', route: '/p/[slug]', boxes: { main: { title: field.text() } } });
  assert.deepEqual(breadcrumbsFor(noCrumbs, readPage(noCrumbs, { ...raw, contentType: 'plain', slug: 'one', title: 'One', boxes: {} }).page), [{ text: 'One', url: '/p/one' }]);
});

test('a type that is never published saves working copies but refuses to publish or schedule', async () => {
  const db = await createTestDb();
  const admin = await addUser(db, 'admin');
  const server = fakeSupabase(db, 'service_role');
  const page: StoredPage = { id: crypto.randomUUID(), contentType: adminPage.name, slug: 'style-guide', title: 'Style guide', boxes: { content: { body: '<p>Use American English.</p>' } }, panels: [] };

  const saved = await savePage(server, adminPage, page, { mode: 'draft', expectedVersion: 0, userId: admin });
  assert.equal(saved.ok, true, JSON.stringify(saved));

  for (const mode of ['publish', 'schedule'] as const) {
    const refused = await savePage(server, adminPage, page, { mode, expectedVersion: 1, userId: admin, publishAt: new Date(Date.now() + 3_600_000).toISOString() });
    assert.deepEqual([refused.ok, !refused.ok && refused.reason], [false, 'invalid']);
    assert.match(JSON.stringify(refused), /never published/);
  }
  const live = await db.query<{ n: number }>(`select count(*)::int as n from public.cera_page_revisions where page_id = $1 and is_published`, [page.id]);
  assert.equal(live.rows[0]?.n, 0);
});
