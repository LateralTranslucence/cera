/**
 * Seeds the local stack with a published home and about page, saved through
 * the same `savePage` path the admin will use. Safe to run repeatedly: each
 * run saves and publishes a new version of the same pages.
 *
 *   npm run seed -w cera-next-site
 */
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { StoredPage } from '@lateraltranslucence/cera';
import { getPageForEditing, savePage } from '@lateraltranslucence/cera/supabase';
import { landingPage } from '../cera/content-types/landing-page.ts';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error('Run `npm run env` first to create .env.local.');

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

/** A content user for attributing seeded saves. It has a random password; nobody signs in as it. */
async function seedEditor(): Promise<string> {
  const email = 'seed-editor@cera.test';
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((u) => u.email === email);
  if (existing) return existing.id;
  const created = await admin.auth.admin.createUser({
    email,
    password: randomBytes(24).toString('hex'),
    email_confirm: true,
    app_metadata: { cera_role: 'editor' },
  });
  if (created.error) throw created.error;
  return created.data.user.id;
}

const pages: StoredPage[] = [
  {
    id: '00000000-0000-4000-8000-00000000c001',
    contentType: 'landing_page',
    slug: 'home',
    title: 'Home',
    boxes: {
      hero: {
        title: 'Pages built from panels',
        copy: '<p>This page is stored in Supabase as an ordered list of typed panels and rendered by <code>&lt;Panels&gt;</code>.</p>',
        background: { color: '#2b2118', overlay: false },
        ctas: [{ text: 'About Cera', url: 'about' }],
      },
      seo: { description: 'An example site built on Cera.' },
      admin: {},
    },
    panels: [
      {
        id: 'home-blocks',
        type: 'blocks',
        v: 1,
        data: {
          title: 'What a panel gets for free',
          perRow: 3,
          blocks: [
            { _id: 'b1', title: 'Typed props', copy: '<p>Component props are inferred from the panel’s fields.</p>' },
            { _id: 'b2', title: 'Defaults on read', copy: '<p>No <code>Number(x) || 3</code> in components.</p>' },
            { _id: 'b3', title: 'Safe saves', copy: '<p>Unknown panels and keys survive a save.</p>', cta: { text: 'Read the handoff', url: 'about' } },
          ],
        },
      },
      {
        id: 'home-text',
        type: 'text-media',
        v: 1, // stored at v1 on purpose: the v1 → v2 migration runs on save
        data: {
          title: 'Drafts and live are separate',
          copy: '<p>Saving a draft never changes this page. Publishing points it at a new revision.</p>',
          mediaAlignment: 'right',
        },
      },
    ],
  },
  {
    id: '00000000-0000-4000-8000-00000000c002',
    contentType: 'landing_page',
    slug: 'about',
    title: 'About',
    boxes: {
      hero: { title: 'About Cera', copy: '<p><em>Cera</em> is Latin for wax, as in Roman wax writing tablets.</p>' },
      seo: { title: 'About Cera', description: 'Why it is called Cera, and what it replaces.' },
      admin: { schemaType: 'AboutPage' },
    },
    panels: [
      {
        id: 'about-text',
        type: 'text-media',
        v: 2,
        data: {
          title: 'Successor to Developers Only',
          copy: '<p>Cera rebuilds the panel model of the Developers Only WordPress theme for Next.js and Supabase.</p>',
          alignment: 'left',
          ctas: [{ text: 'Back home', url: '/' }],
        },
      },
    ],
  },
];

const userId = await seedEditor();
for (const page of pages) {
  const existing = await getPageForEditing(admin, landingPage, page.id);
  const result = await savePage(admin, landingPage, page, { mode: 'publish', expectedVersion: existing?.version ?? 0, userId });
  if (!result.ok) {
    console.error(`Could not save "${page.slug}":`, result);
    process.exitCode = 1;
    continue;
  }
  console.log(`Published /${page.slug === 'home' ? '' : page.slug} (version ${result.version})`);
  for (const issue of result.issues) console.warn(`  ${issue.severity}: ${issue.path.join('.')} ${issue.message}`);
}
