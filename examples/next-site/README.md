# Cera example site

A Next.js site that renders Cera pages from a local Supabase stack, with a minimal admin for editing them. Its `landing_page` content type (`cera/`) is built from Cera's core panels (`@lateraltranslucence/cera/panels`), and the library's tests use it too.

## Run it

From the repository root:

```bash
npm install
supabase start                      # local stack on ports 56320–56329, applies supabase/migrations
npm run env -w cera-next-site       # writes examples/next-site/.env.local from `supabase status`
npm run seed -w cera-next-site      # admin account + a published home and about page
npm run dev -w cera-next-site       # http://localhost:3100
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
| `cera/` | The `landing_page` content type, with every core panel (`/panels` shows one of each); `simple_page` (no panels: image, description, content), which shares landing pages' addresses at `/[slug]`; and the package's `formType` (forms, shown on pages by the Form panel) and `iconType` (your own icons). Panels come from the package (`cera/blocks`, …); a site's own panels would sit here too, under names without the reserved `cera/` prefix |
| `app/(site)/` | Live pages: `findPublishedPage` (a landing page or a simple page) → `RoutedPage`, with `generateMetadata` from `pageMetadata` |
| `app/admin/` | Sign-in, page list and the editor (`PageEditor` from `@lateraltranslucence/cera/admin`) |
| `app/admin/simple-pages`, `app/admin/icons` | Simple pages and icons, through the shared screens in `content-screens.tsx` (`content.ts` says where each type lives in the admin) |
| `app/admin/forms`, `app/admin/submissions` | Forms (built in the same editor; fields are its panels) and what visitors sent (admins and editors; CSV download at `submissions/export`) |
| `app/api/cera/forms` | Where forms post: `createFormHandler` (token, honeypot, checks, rate limit), storing submissions with the secret key |
| `app/admin/users`, `app/admin/account` | People (admins: add people, set roles) and Account (change your password) |
| `app/admin/actions.ts` | Server actions: save/publish via `savePage` with the user from the verified session; media upload (prepare and finish, editors only) and the library; sign in/out |
| `app/admin/preview` | Preview from the admin: checks the session, enables draft mode |
| `app/api/draft` | Preview for external tools: `/api/draft?secret=…&slug=about` |
| `proxy.ts` | Refreshes the admin's Supabase session cookies |
| `lib/auth.ts` | `requireStaff(role)`: verified user + Cera role from `app_metadata.cera_role` |
| `lib/pages.ts` | Picks the live revision or, in draft mode, the working copy; logs read issues; `loadContextFor` gives panels' `load` a page resolver, a form resolver and icons (published-only live) |
| `lib/icons.ts` | The site's icon sets (its own icons, then Lucide; add Font Awesome packs here) and the cached live icon lookup |
| `lib/supabase.ts` | Anonymous client (published pages only) and secret-key client (server only) |
| `scripts/seed.ts` | Admin account and pages, saved through `savePage` like the admin does |
