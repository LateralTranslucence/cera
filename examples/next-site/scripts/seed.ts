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

/** Does this password still sign in? Checked with a throwaway client so no session is kept. */
async function passwordWorks(email: string, password: string): Promise<boolean> {
  const probe = createClient(url!, secret!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await probe.auth.signInWithPassword({ email, password });
  return !error;
}

/**
 * Creates the user, or makes sure its role (and, if given, password) match.
 * The password is only reset when it no longer works: resetting it signs the
 * user out everywhere, which re-running the seed shouldn't do.
 */
async function ensureUser(email: string, password: string, role: 'admin' | 'editor', keepPassword = false): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((u) => u.email === email);
  if (existing) {
    const reset = !keepPassword && !(await passwordWorks(email, password));
    const updated = await admin.auth.admin.updateUserById(existing.id, { app_metadata: { cera_role: role }, ...(reset && { password }) });
    if (updated.error) throw updated.error;
    return existing.id;
  }
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { cera_role: role } });
  if (created.error) throw created.error;
  return created.data.user.id;
}

/** Attributes seeded saves. Random password: nobody signs in as it. */
const seedEditor = () => ensureUser('seed-editor@cera.test', randomBytes(24).toString('hex'), 'editor', true);

/** The account you sign in to /admin with (credentials in .env.local). */
async function seedAdmin(): Promise<void> {
  const email = process.env.CERA_ADMIN_EMAIL;
  const password = process.env.CERA_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('CERA_ADMIN_EMAIL / CERA_ADMIN_PASSWORD missing. Run `npm run env` again.');
  await ensureUser(email, password, 'admin');
  console.log(`Admin account ${email} is ready (password in .env.local).`);
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
        type: 'cera/blocks',
        v: 1,
        data: {
          title: 'What a panel gets for free',
          perRow: 3,
          blocks: [
            { _id: 'b1', title: 'Typed props', copy: '<p>Component props are inferred from the panel’s fields.</p>' },
            { _id: 'b2', title: 'Defaults on read', copy: '<p>Components get every default filled in; no fallback logic.</p>' }, // block copy is the limited toolbar: no <code>
            { _id: 'b3', title: 'Safe saves', copy: '<p>Unknown panels and keys survive a save.</p>', cta: { text: 'Read the handoff', url: 'about' } },
          ],
        },
      },
      {
        id: 'home-text',
        type: 'cera/text-media',
        v: 1, // stored at v1 on purpose: the v1 → v2 migration runs on save
        data: {
          title: 'Drafts and live are separate',
          copy: '<p>Saving a draft never changes this page. Publishing points it at a new revision.</p>',
          mediaAlignment: 'right',
        },
      },
      {
        id: 'home-featured',
        type: 'cera/featured-post',
        v: 1,
        // Title, description and link come from the About page at render time (its load()).
        data: { postTypes: ['landing_page'], post: ['00000000-0000-4000-8000-00000000c002'] },
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
        type: 'cera/text-media',
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

await seedAdmin();
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
