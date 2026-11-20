/**
 * Seeds the local stack with published example pages (home, about, panels),
 * saved through the same `savePage` path the admin uses. Safe to run
 * repeatedly: each run saves and publishes a new version of the same pages,
 * replacing any edits made to them in the admin.
 *
 *   npm run seed -w cera-next-site
 *
 * With `--only <slug>[,<slug>]` it publishes just those pages and leaves the
 * admin account alone, e.g. to add a new example page to a site whose other
 * pages have been edited:
 *
 *   node --env-file=.env.hosted --import tsx scripts/seed.ts --only panels
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
  // The env file is .env.local for the local stack and .env.hosted for the hosted one.
  console.log(`Admin account ${email} is ready (password: CERA_ADMIN_PASSWORD in the env file you ran this with).`);
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
  {
    // One of each panel ported in batch 1, so they can be seen together.
    id: '00000000-0000-4000-8000-00000000c003',
    contentType: 'landing_page',
    slug: 'panels',
    title: 'Panels',
    boxes: {
      hero: { title: 'The core panels', copy: '<p>Every panel on this page ships with Cera, under the <code>cera/</code> namespace.</p>' },
      seo: { description: 'A page with one of each Cera core panel.' },
      admin: {},
    },
    panels: [
      {
        id: 'panels-text',
        type: 'cera/text',
        v: 1,
        data: {
          title: 'Text',
          copy: '<p>A title, copy and buttons. With <strong>Overlay</strong> on, the text sits in a box over the background.</p>',
          background: { color: '#1d2a3a', overlay: false },
          overlay: true,
          ctas: [{ text: 'Back home', url: '/' }],
        },
      },
      {
        id: 'panels-tabs',
        type: 'cera/tabs',
        v: 1,
        data: {
          title: 'Tabs',
          copy: '<p>Use the arrow keys to move between tabs. A link to <a href="#europa">#europa</a> opens that tab.</p>',
          tabs: [
            { _id: 't1', navLabel: 'Mars', title: 'The red planet', copy: '<p>Iron oxide dust gives Mars its color.</p>' },
            { _id: 't2', navLabel: 'Moon', title: 'Our satellite', copy: '<p>The Moon keeps one face toward Earth.</p>' },
            { _id: 't3', navLabel: 'Europa', title: 'An ocean under ice', copy: '<p>Europa likely hides a salty ocean beneath its crust.</p>', cta: { text: 'About Cera', url: 'about' } },
          ],
        },
      },
      {
        id: 'panels-tree',
        type: 'cera/decision-tree',
        v: 1,
        data: {
          title: 'Decision Tree',
          cards: [
            {
              _id: 'd1',
              title: 'Orbit',
              overview: '<p>Study the planet from above.</p>',
              copy: '<p>Orbiters map the whole surface and relay data for landers.</p>',
              cta: { text: 'Plan an orbiter', url: '/about' },
              list: [{ _id: 'd1a', title: 'Mapping', url: '/about' }, { _id: 'd1b', title: 'Relays', url: '/about' }],
            },
            {
              _id: 'd2',
              title: 'Land',
              overview: '<p>Touch the ground.</p>',
              copy: '<p>Landers and rovers sample rock and soil up close.</p>',
              list: [{ _id: 'd2a', title: 'Rovers', url: '/about' }],
            },
          ],
        },
      },
      {
        id: 'panels-quotes',
        type: 'cera/quotes',
        v: 1,
        data: {
          title: 'Quotes',
          quotes: [
            { _id: 'q1', quote: '<p>Per aspera ad astra.</p>', attribution: 'Latin proverb' },
            { _id: 'q2', quote: '<p>Non est ad astra mollis e terris via.</p>', attribution: 'Seneca' },
            { _id: 'q3', quote: '<p>Two or more quotes scroll sideways.</p>', attribution: 'Cera' },
          ],
        },
      },
      {
        id: 'panels-cta',
        type: 'cera/cta',
        v: 1,
        data: {
          title: 'CTA',
          copy: '<p>A short pitch and a button or two, on a colored background.</p>',
          background: { color: '#5b3412', overlay: false },
          ctas: [{ text: 'See the home page', url: '/' }, { text: 'About', url: 'about' }],
        },
      },
      {
        id: 'panels-media',
        type: 'cera/featured-media',
        v: 1,
        // Media is left empty in the seed (files aren't seeded); pick an image in the admin.
        data: { title: 'Featured Media', copy: '<p>One large image or video. Add one in the admin.</p>' },
      },
      {
        id: 'panels-stats',
        type: 'cera/stats',
        v: 1,
        data: {
          title: 'Stats',
          copy: '<p>Numbers count up when they scroll into view (unless you prefer reduced motion).</p>',
          stats: [
            { _id: 's1', number: 225, after: 'M km', description: 'Average distance from Earth to Mars' },
            { _id: 's2', number: 24.6, decimal: true, after: ' h', description: 'Length of a Martian day' },
            { _id: 's3', before: '−', number: 63, after: '°C', description: 'Average surface temperature' },
            { _id: 's4', number: 10, countDown: true, description: 'Counts down to zero' },
          ],
        },
      },
      {
        id: 'panels-accordion',
        type: 'cera/accordion',
        v: 1,
        data: {
          title: 'Accordion',
          items: [
            { _id: 'a1', title: 'Why is Mars red?', text: '<p>Iron oxide, rust, in its dust and rocks.</p>' },
            { _id: 'a2', title: 'Does Mars have moons?', text: '<p>Two small ones: Phobos and Deimos.</p>' },
            { _id: 'a3', title: 'Can you use the keyboard?', text: '<p>Yes: arrow keys move between questions, Enter opens one.</p>' },
          ],
        },
      },
      {
        id: 'panels-gallery',
        type: 'cera/gallery',
        v: 1,
        // Images are added in the admin (files aren't seeded).
        data: { title: 'Gallery', copy: '<p>A grid of images that open full size. Add some in the admin.</p>' },
      },
    ],
  },
];

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > -1 ? new Set((process.argv[onlyArg + 1] ?? '').split(',').filter(Boolean)) : null;
if (only) {
  const unknown = [...only].filter((slug) => !pages.some((p) => p.slug === slug));
  if (only.size === 0 || unknown.length) throw new Error(`--only takes page slugs from this script: ${pages.map((p) => p.slug).join(', ')}.`);
} else {
  await seedAdmin();
}
const userId = await seedEditor();
for (const page of pages.filter((p) => !only || only.has(p.slug))) {
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
