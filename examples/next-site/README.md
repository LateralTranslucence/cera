# Cera example site

A Next.js site that renders Cera pages from a local Supabase stack, with an admin for editing them. Its `landing_page` content type (`cera/`) is built from Cera's core panels (`@lateraltranslucence/cera/panels`), and the library's tests use it too. To add a content type, see "Adding a content type" in the repository's README.

## Run it

From the repository root:

```bash
npm install
supabase start                      # local stack on ports 56320–56329, applies supabase/migrations
npm run env -w cera-next-site       # writes examples/next-site/.env.local from `supabase status`
npm run seed -w cera-next-site      # admin account + a published home and about page
npm run dev                         # builds the package, rebuilds it on change, and serves http://localhost:3100
```

- **Admin:** http://localhost:3100/admin. Sign in with `CERA_ADMIN_EMAIL` / `CERA_ADMIN_PASSWORD` from `.env.local` (generated locally; the seed creates or resets that account).
- **Supabase Studio:** http://127.0.0.1:56323.

If saves or page loads stall for many seconds, check Docker's memory: each local Supabase stack needs a few hundred MB, and a 1.4 GB Docker VM running several stacks starts swapping.

## Deployed

- **Live:** the repository's Vercel project (deploys `main` on every push; pull requests get previews behind Vercel sign-in).
- **Database:** a hosted Supabase project. Production and previews share it.

Vercel builds from `examples/next-site` but installs from the repository root (`cd ../.. && npm ci`), because the site uses the library through the npm workspace. Its environment variables are `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `CERA_PREVIEW_SECRET`.

The same values, plus the hosted admin account, are in `.env.hosted` (not committed). Live page reads are cached (`lib/pages.ts`); publishing or unpublishing in the admin clears the cache at once. Changes made any other way, like the seed below, show on the live site within five minutes.

To apply new migrations and seed the hosted project:

```bash
supabase db push --linked
cd examples/next-site && node --env-file=.env.hosted --import tsx scripts/seed.ts
```

## What's here

| Path | Purpose |
|---|---|
| `cera/` | The `landing_page` content type, with every core panel (`/panels` shows one of each); `simple_page` (no panels: image, description, content), which shares landing pages' addresses at `/[slug]`; and the package's `formType` (forms, shown on pages by the Form panel) and `iconType` (your own icons). Panels come from the package (`cera/blocks`, …); a site's own panels would sit here too, under names without the reserved `cera/` prefix. `cera/index.ts` lists every type (`contentTypes`, in the sidebar's order); `cera/views.ts` names the view for each type with pages of its own |
| `app/(site)/[[...path]]` | Live pages at every address: `loadPage` finds the types routed there (`matchRoute`) and the page, and `RoutedPage` renders its type's view, with `generateMetadata` from `pageMetadata` |
| `app/admin/admin.ts` | The admin's screens: the package's `createAdminScreens`, built from `contentTypes` (each type's sidebar entry, list, new and edit screens), plus this site's own screens in the sidebar (`items`) |
| `app/admin/[type]` | Every content type's list, new and edit screens, at `/admin/<editor.path>` (`/admin/pages`, `/admin/simple-pages`, `/admin/forms`, …); `/admin` goes to the first type's list |
| `app/admin/EditorClient.tsx` | The package's `PageEditor` with this site's content types and server actions (a client component, so it imports the types itself) |
| `app/admin/submissions`, `app/admin/team` | What visitors sent through forms (admins and editors; CSV download at `submissions/export`), and admin pages to read under Team |
| `app/api/cera/search` | The Search panel's endpoint: `createSearchHandler` (live pages, or working copies in draft mode), with live results cached |
| `app/api/cera/forms` | Where forms post: `createFormHandler` (token, honeypot, checks, rate limit), storing submissions with the secret key |
| `app/admin/users`, `app/admin/account` | People (admins: add people, set roles) and Account (change your password) |
| `app/admin/settings`, `app/admin/approvals` | Settings (admins: approval workflows per content type, in one tier or two) and Approvals (what's waiting, and for whom) |
| `app/admin/actions.ts` | Server actions: one-line wrappers around the package's `createAdminActions` (save and publish with the user from the verified session, media, people, sign in and out), each checking the role itself |
| `app/admin/preview` | Preview from the admin (`createPreviewHandler`): checks the session, enables draft mode; with `page` and `version`, an old version from History |
| `app/api/draft` | Preview for external tools: `/api/draft?secret=…&slug=about` |
| `app/api/cera/cleanup` | Daily upkeep for Vercel Cron (`vercel.json`, `CRON_SECRET`): removes unfinished and replaced uploads nothing uses, prunes old drafts |
| `proxy.ts` | Refreshes the admin's Supabase session cookies |
| `lib/auth.ts` | `requireStaff(role)` from the package's `createStaffAuth`: verified user + Cera role from `app_metadata.cera_role` |
| `lib/menus.ts`, `components/SiteMenu.tsx` | The header and footer menus (Menus in the admin, IDs `main` and `footer`): live and cached, or the working copy in preview |
| `lib/pages.ts` | For an address, picks the live revision or, in draft mode, the working copy (or the old version History asked for); logs read issues; `loadContextFor` (the package's `createLoadContexts`) gives panels' `load` linked pages, forms, icons and searches, cached on the live site |
| `lib/icons.ts` | The site's icon sets: its own icons, then Lucide |
| `lib/supabase.ts` | Anonymous client (published pages only) and secret-key client (server only) |
| `scripts/seed.ts` | Admin account and pages, saved through `savePage` like the admin does |
| `scripts/import-developers-only.ts` | One-off import of the Developers Only WordPress site's content from its REST API (`npm run import:devo`; see decision 35 in HANDOFF.md) |
