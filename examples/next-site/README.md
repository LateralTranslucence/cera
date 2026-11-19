# Cera example site

A Next.js site that renders Cera pages from a local Supabase stack. It is also where the example panels and the `landing_page` content type live (`cera/`), and the library's tests use those same definitions.

## Run it

From the repository root:

```bash
npm install
supabase start                      # local stack on ports 56320–56329, applies supabase/migrations
npm run env -w cera-next-site       # writes examples/next-site/.env.local from `supabase status`
npm run seed -w cera-next-site      # publishes a home and an about page
npm run dev -w cera-next-site       # http://localhost:3100
```

Supabase Studio is at http://127.0.0.1:56323.

## What's here

| Path | Purpose |
|---|---|
| `cera/` | Panel definitions and components, and the `landing_page` content type |
| `app/page.tsx`, `app/[slug]/page.tsx` | Live pages: `getPublishedPage` → `<Panels>`, with `generateMetadata` from `pageMetadata` |
| `app/api/draft` | Draft-mode preview: `/api/draft?secret=…&slug=about` shows the unpublished working copy |
| `lib/pages.ts` | Picks the live revision or, in draft mode, the working copy; logs read issues |
| `lib/supabase.ts` | Anonymous client (published pages only) and secret-key client (server only) |
| `scripts/seed.ts` | Saves pages through `savePage`, the same path the admin will use |

## Not done yet

- **Admin.** Pages can only be changed with the seed script for now.
- **Caching.** Pages render per request (`force-dynamic`); `revalidateTag` on publish comes with the admin.
- **HTML sanitizing.** `components/Html.tsx` trusts stored HTML. Cera must sanitize `f.html()` values on save before this is safe for real sites.
- **Media uploads.** `lib/media.ts` builds URLs for the `cera-media` bucket, but there is no upload flow yet.
