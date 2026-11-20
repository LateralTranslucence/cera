# Handoff: Cera core (field builder sketch)

**For:** Claude Code
**From:** LateralTranslucence
**Status:** Working sketch. `npm run check` passes (typecheck plus 106 tests).

## Goal

Rebuild the principles of the **Developers Only** WordPress theme as a Next.js CMS that installs as an npm package. It is built from scratch: no Payload, no ACF-style dependency. Supabase provides auth, storage and Postgres.

This bundle is the **core type layer**: the field builder `f`, `definePanel`, `defineContentType`, page validation, panel migrations and a minimal renderer. Everything else is built on top of it.

The source theme is the WordPress theme at `wp-content/themes/developers-only/` in a Developers Only WordPress install.
Read these before changing the design:

| Theme file | What it defines |
|---|---|
| `api/classes/class-custom-post-type.php` | Abstract base class: settings, meta boxes, save flow, `dynamic_interface` (panel switching), REST |
| `api/classes/post-types/class-landing-page.php` | The 15 panel types, default panel fields, the Hero/SEO/Admin boxes, notes and character counts |
| `api/classes/post-types/NEW_POST_TYPE_TEMPLATE.php` | Boilerplate for a content type |
| `api/classes/class-form-field-*.php` | Admin widgets (`display`), sanitizing (`validate`), REST serialization (`api-display`) |
| `api/functions.helpers.php` → `devo_get_meta_field_type()` | How field type strings are resolved |
| `app/loaders/PanelLoader.tsx`, `app/components/panels/*.tsx` | React panel components to port |
| `app/utils/panels/index.ts`, `app/utils/types/Panels.ts` | Hand-written field→prop mapping, which this design makes unnecessary |
| `extensions/README.md` | The theme's extension model (auto-discovery; core wins on name collision). Cera avoids collisions instead: decision 20 |
| `CLAUDE.md` | Theme architecture walkthrough |

## Run it

```bash
npm install
npm run check      # tsc --noEmit + node --test (via tsx); no Docker needed
```

The example site runs against a local Supabase stack; see [examples/next-site/README.md](examples/next-site/README.md). Its ports (56320–56329) are chosen to avoid the other local Supabase projects (Supabase's default is 543xx).

Versions used: TypeScript 7.0, Zod 4.6, React 19, Node 22+.

## Layout

```
src/
  fields.ts         f.* builders, Field type, InferFields, MediaRef/CTA/Background schemas
  panel.ts          PanelDefinition, PanelData, PanelInstance (discriminated union), PanelPropsOf, LoadContext
  define-panel.ts   definePanel (sites) and defineCorePanel (core panels, the reserved cera/ namespace)
  media-url.ts      mediaUrl(): public URL of a cera-media object (exported from `/supabase`)
  defaults.ts       panelDefaults (Title, Background, Copy, ID) + omit()
  content-type.ts   defineContentType, PageDocument, PageOf, runtime pageSchema
  migrate.ts        upgradePanel / upgradePagePanels (version → version migrations)
  document.ts       readPage (forgiving, for rendering) and preparePageForSave (keeps unknown data; draft vs publish; sanitizes rich text)
  roles.ts          CERA_ROLES, their labels, CeraUser
  color.ts          isLightColor: dark text beats light on a background color (WCAG contrast); PanelFrame adds
                    has-light-background for a light color with no image, video or overlay
  media.ts          uploadable types (MEDIA_TYPES), size limits, formatBytes, MediaItem, the upload/update/delete types, MediaUse, toMediaRef
  sanitize.ts       rich-text allowlists (full / limited) on sanitize-html; loaded lazily by document.ts
  panels/           the `/panels` entry: the core panels (cera/blocks, cta, decision-tree, featured-media, featured-post,
                    quotes, tabs, text, text-media v2, accordion, stats, gallery, posts; `corePanels` lists them), PanelFrame (the shared section,
                    background, title and copy), Html and CtaLink(s); Tabs and Decision Tree have small client parts
  next/cache.ts     the `/next/cache` entry: cacheLive (Next data cache, tag cera:pages) and pagesChanged (call after publishing)
  next/             the `/next` entry: async <Panels> Server Component, pageMetadata, jsonLdString; React lives only here
  supabase/         the `/supabase` entry: getPublishedPage, getDraftPage, getPageForEditing, listPages, savePage, unpublishPage,
                    createPageResolver (linked pages for panels' load: published-only live, working copies in preview),
                    prepareMediaUpload / finishMediaUpload / listMedia / updateMedia / mediaUsage / deleteMedia (media.ts), mediaUrl,
                    listCeraUsers / createCeraUser / setCeraRole (users.ts)
  admin/            the `/admin` entry ('use client'): PageEditor, FieldMapForm (one control per field kind), state helpers,
                    MediaInput, GalleryInput and mediaUploader (media.tsx: upload, drop, library, typed path or URL);
                    PageEditor (top bar, card stack, dnd-kit reordering, schedule/unpublish/add-panel dialogs), PageList
                    (the Pages table: search, status filter, sort, paging), AdminSidebar, icons.tsx (Icon, CeraSeal, CeraLockup),
                    Dialog, MediaManager (the Media page: browse, upload, alt text, usage, delete), UsersManager (People),
                    RichTextInput (f.html: Tiptap editor, HTML view) with rich-text/extensions.ts (schema per toolbar)
                    and rich-text/html.ts (tidyEditorHtml, sameContent);
                    `/admin.css` is its stylesheet, scoped under .cera-admin
supabase/
  config.toml              local stack (`supabase start`), ports 563xx
  migrations/…_cera_init.sql          cera_pages, cera_page_revisions, cera_media, RLS, cera_save_page / cera_unpublish_page
  migrations/…_cera_media_bucket.sql  public `cera-media` Storage bucket
  migrations/…_cera_media_uploads.sql bucket type/size limits, cera_media search column, cera_add_media
  migrations/…_cera_media_editing.sql cera_update_media (alt text), cera_media_usage, cera_delete_media (refuses files in use)
  migrations/…_cera_scheduling.sql    scheduled publishing (cera_schedule_page, cera_cancel_schedule, cera_publish_due + pg_cron job),
                                      cera_page_summaries / cera_user_email for the Pages list
examples/
  next-site/        npm workspace: Next.js 16 example site (see its README)
    cera/           the landing_page content type, built from the core panels; it imports the package like a
                    real site, and the library tests use it too
  sample-page.json  a stored page row
test/
  types.test.ts     compile-time assertions on inferred types (Equal/Expect)
  runtime.test.ts   validation, defaults, migrations, hooks, guards
  document.test.ts  forgiving reads, lossless saves, draft vs publish, beforeSave
  sql.test.ts       the migrations: publishing, conflicts, roles, RLS
  supabase.test.ts  end to end: savePage → SQL → getPublishedPage / getPageForEditing
  render.test.ts    <Panels> output, hidden panels, a panel that fails to load
  metadata.test.ts  pageMetadata and JSON-LD escaping
  panels.test.ts    every core panel through <Panels>: the frame (background, overlay, video), each panel's markup
  users.test.ts     people: listing, adding with a temporary password, roles, the own-role and last-admin guards
  schedule.test.ts  scheduling: due → live, replacing, cancelling, failures; the page list's statuses, emails and access
  rich-text.test.ts the editor schema under happy-dom: exact round trips, respellings, WordPress classes and images, what it would lose
  media.test.ts     upload paths, type/size checks, finishing against what Storage reports, the library, alt edits, usage, delete, grants
  sanitize.test.ts  the allowlists, links, removal warnings, sanitizing on save (repeaters, unknown panels, beforeSave)
  load.test.ts      panels' load() through <Panels>: Featured Post, overrides, failures, the context load() gets
  support/db.ts     PGlite (Postgres in-process, no Docker) with Supabase's roles stubbed, and a fake supabase-js client
```

## Decisions already made (don't revisit without asking the project owner)

1. **Supabase only.** No storage-adapter abstraction for now.
2. **Keys, not labels.** Field keys are stable camelCase identifiers. `label` is display-only. In the theme, labels became meta keys (`page_title_3`), so renaming a label stranded the saved data.
3. **Panels are an ordered JSONB array** on the page row, not numbered flat keys. Each instance looks like `{ id, type, v, hidden, data }`. Reordering is an array move.
4. **One definition per panel.** Admin form, validation, stored type and component props all come from `fields`. There is no separate `set_panel_types()` list and no `PanelLoader` map to keep in sync.
5. **Zod is the runtime schema.** Defaults are applied on parse, so components never need fallback logic like `Number(x) || 3`.
6. **Optional by default.** `required: true` makes a field non-optional, and `default` makes it always present. `toggle`, `perRow`, `ctas`, `gallery`, `repeater`, `relation` and `background` always have a value.
7. **Repeater items get `_id`.** This gives a stable React key and drag-and-drop identity.
8. **`relation` is always `string[]`.** Use `limit: 1` for a single pick.
9. **Panel versioning.** `version` plus `migrations[n]` (n → n+1). `definePanel` throws if a migration step is missing. Stored panels are upgraded *before* validation.
10. **Panel `type` keys are kebab-case,** optionally behind one namespace (`pricing-table`, `acme/pricing-table`). Core panels keep the theme's names in the `cera/` namespace (`cera/text-media`), so importing theme content is a fixed rename (see 20).
11. **The page model keeps `boxes` (fixed groups) separate from `panels`.** This mirrors the theme's `default_meta_boxes: ['Hero','SEO','Admin']` versus the dynamic Panel box.
12. **Page concerns are typed functions,** not string syntax: `seo.title: p => p.boxes.seo.title || p.title` replaces `'SEO Title||post_title'`. Likewise `jsonLd` for schema.org, `hidden` for `hide_field`, and `hooks.beforeSave` / `hooks.afterSave` for `onsave_callback` / `aftersave_callback`.
13. **The name is Cera** (Latin for wax, as in Roman wax writing tablets). It ships as one package, `@lateraltranslucence/cera`, with subpath exports: `.` is the core (no React or Next imports) and `./next` is the renderer, admin and routes. React is an optional peer dependency. The installer is the unscoped `create-cera` (`npx create-cera`), which was free on npm on 2026-11-16. Shorter scopes (`@cera`, `@syndr`) were not available.
14. **Saves never lose data; reads never fail on content.** Field-map objects and repeater items are loose (unknown keys are kept). `preparePageForSave` writes back unknown panel types, unknown keys and retired boxes untouched. `readPage` falls back to a field's default when it fails, skips panels it can't repair or doesn't know, and reports issues instead of throwing. The admin loads pages with `getPageForEditing`, which returns the raw stored page, so it can't drop what it never saw.
15. **Drafts save with warnings; publishing requires valid fields.** A draft with an empty title or an invalid field still saves (the raw value is kept). Publishing turns those into errors. Bad slugs and duplicate panel ids are errors in both modes. `beforeSave` runs only on fully valid pages.
16. **Draft and live are separate.** `cera_pages` is the working copy; every save writes a `cera_page_revisions` row; the live page is the revision with `is_published`. Saving a draft never changes the live site. (The theme's "Update" went live immediately.)
17. **Browsers never write.** No insert/update/delete grants for `anon`/`authenticated`. The app server validates with `preparePageForSave` and calls `cera_save_page` with the service role, passing the user id from a verified session; the function re-checks that the user is an admin or editor. Roles live in `app_metadata.cera_role` (`admin | editor | viewer`), which users can't set themselves. Saves use optimistic locking (`expectedVersion`).
18. **Rich text is stored as sanitized HTML** (decided 2026-11-19), not structured JSON. Existing WordPress content is HTML, and the toolbars are small enough for an allowlist. `preparePageForSave` sanitizes every `f.html()` value (repeaters included) with `sanitize-html`: the `full` toolbar follows `wp_kses_post` minus inline styles (headings, lists, links, images over http(s), tables, `class`); `limited` follows WordPress's "teeny" toolbar (bold, italic, underline, strikethrough, blockquote, lists, links). Links allow http(s), mailto, tel and relative paths; `target="_blank"` gets `rel="noopener noreferrer"`. Anything removed becomes an `html-sanitized` warning, which never blocks a save. Panels of unknown types aren't sanitized (they aren't rendered). Rendering trusts stored HTML because of this and decision 17.
19. **Panels load their own data on the server.** `definePanel({ load })` runs before render in `<Panels>` (in parallel with the component import); its awaited result is the component's `loaded` prop, typed from `load`'s return (`PanelPropsOf<typeof fields, Loaded>`). Panels without `load` have no `loaded` prop. Keep `load` in its own `*.load.ts` file, like the fields, so the component can import the result type. `load` gets `ctx.pages.byIds()` (a `PageResolver`) and `ctx.draft`; sites build the resolver with `createPageResolver`. On the live site it returns only published, visible pages, so a panel can't leak a draft or a hidden page; in preview it returns working copies. A failing `load` skips that panel, not the page. Linked pages carry title, URL (content type `url`, default `route`), type label, and the content type's SEO description and image.
20. **Core panels live in the `cera/` namespace** (decided 2026-11-19). The panels ported from the theme ship in the package (`@lateraltranslucence/cera/panels`) as `cera/blocks`, `cera/text-media` and so on, defined with the internal `defineCorePanel`. `definePanel` rejects `cera/` types, so a site's panel can never collide with a core one, and a stored type always means the same panel. Sites name their panels freely (`pricing-table`, or their own namespace). This replaces the theme's "core wins on collision". Letting a site restyle or swap a core panel's component is a separate, later question. Core components get media URLs from `mediaUrl()`, which reads `NEXT_PUBLIC_SUPABASE_URL`, and are plain markup with `panel--*` classes for sites to style.
21. **Icons: both a content type and a bundled set** (decided 2026-11-19). The theme's icon content type stays, for a site's custom icons; a bundled icon set covers standard ones. `f.icon()` picks from either.
22. **WordPress import: Developers Only's astronomy content only** (decided 2026-11-19). A one-off import script, not a general migration tool. It maps theme panel keys to `cera/` types and needs a database export or the site's REST API (the local checkout has neither).
23. **Media uploads go straight to Storage** (decided 2026-11-19). The server checks the type and size the browser claims, picks the path (`2026/11/1a2b3c4d-name.jpg`, extension from the type) and returns a one-time signed upload URL; the browser PUTs the file; the server then reads the object's real type and size from Storage, deletes it if they aren't allowed, and records it with `cera_add_media` (role re-checked, like saves). Files never pass through the app server, so hosts' request-size limits (4.5 MB on Vercel) don't apply. The bucket itself allows only JPEG, PNG, WebP, GIF, AVIF, MP4 and WebM up to 50 MiB; the app limits images to 10 MB. SVG is refused because it can carry scripts (the icon content type will need its own answer). A field stores a `MediaRef` copy (id, path, kind, alt, width, height): alt text is per use, and dimensions are measured in the browser as layout hints. Typed paths and URLs still work, for embeds and seeded content.
24. **Admins manage people in the admin** (decided 2026-11-20). The People page (`UsersManager` with `createCeraUser` / `setCeraRole` from `./supabase`) lists every account with its role, adds a person with a role and a 20-character temporary password shown once, and changes or removes roles. Only admins see it, which is what now separates `admin` from `editor`. You can't change your own role, and the last admin can't be demoted, so the site can't lose its admins. Removing access clears the role and keeps the account; nothing deletes accounts. People change their password on the Account page. Email invites aren't built: Supabase's built-in mailer is rate-limited, so they wait for a mail provider. A role change applies to saves at once (the database reads the role fresh); a signed-in person's own view updates when they sign in again or within the hour.
25. **Live reads are cached; publishing clears them** (decided 2026-11-20). `@lateraltranslucence/cera/next/cache` wraps live (published-only) reads in Next's data cache (`unstable_cache`, tag `cera:pages`): the example site caches the page read and the linked-page lookups behind Featured Post and Posts. Pages still render per request, because draft-mode preview needs the request, but they stop waiting on the database. Publishing and unpublishing call `pagesChanged()` (Next's `updateTag`, read-your-own-writes) from the Server Action, so the next request is fresh. One tag covers every page, since a change to one page shows on others. Changes made outside the admin (the seed, SQL) appear within 300 seconds. Draft preview and anything read with a user's session are never cached. Moving to Next 16's Cache Components (`'use cache'`) and fully static pages is a later step.
26. **The media library is edited on its own page; files in use can't be deleted** (decided 2026-11-20). The admin's Media page (`MediaManager`) lists the library with search and a type filter, uploads (several at once, or dropped), and shows a file's details, alt text and the pages that use it. Only the library alt text can change: it's the default for new uses, and pages that already use a file keep their own copy (decision 23), which editors change on the page. Paths can't be renamed, since pages store them. A file is in use when its path appears in a page's working copy or live revision, which catches fields, galleries and images in rich text (`cera_media_usage`, run as the caller so row-level security applies). `deleteMedia` refuses a file in use and names the pages; otherwise it deletes the library row (role and usage re-checked in one transaction) and then the Storage object. Older revisions aren't checked, so restoring one that used a deleted file would show it missing. Editors and admins can edit and delete; viewers can look.
27. **Rich text is edited visually with Tiptap, and opening text never rewrites it** (decided 2026-11-20). `f.html()` fields use `RichTextInput`: Tiptap 3 (ProseMirror), pinned to an exact version, with a schema per toolbar that mirrors the sanitizer (decision 18), so it can only write what a save keeps. `full`: paragraphs, headings 2–6, bold, italic, underline, strikethrough, links (with "open in a new tab"), lists, quotes, code, horizontal lines, sub/superscript, images inline in paragraphs (uploaded or picked from the library, with alt text) and `class` attributes. `limited`: the theme's teeny toolbar. Tables and figures aren't in the schema. Before showing stored HTML, the editor checks whether it would keep it (`sameContent` compares what shows, not how it's spelled: `<b>` = `<strong>`, mark order, a paragraph inside a list item); if not, the field opens in its HTML view with a note, and switching to the visual view changes nothing until the person edits there. Every field also has an HTML view. The editor writes list items without an inner paragraph, as WordPress does, and never adds a trailing paragraph. Everything is still sanitized on save. All 29 rich-text fields on the migrated Developers Only page open visually and save back unchanged.
28. **The admin follows the Cera design brief** (decided 2026-11-20, brief `cera-admin-handoff`). Tokens (surface, line, ink, honey and so on, plus `surface-sunken` and `line-strong`, which the brief proposed) are defined on `.cera-admin`, not `:root`, so they can't touch a site's CSS; the older `--cera-*` names are aliases. Sites load Fraunces (SOFT, opsz), Inter and JetBrains Mono as `--cera-font-display/sans/mono` (the example uses `next/font`, which self-hosts them). Dark mode follows the system with the brief's dark tokens (`data-theme` pins either). The shell is a sidebar (lockup; Pages, expandable with "+ New" and every page; Media; People for admins; the user chip opens Account, View site and Sign out) and a main column. Where the brief and Cera differ, Cera wins: only features that exist are in the sidebar (no Regions, Subjects, Menus or Settings yet); Hero is a fixed lead box shown as the first card, not a movable panel (decision 11); every form is still generated from field definitions (decision 4) and restyled to labels-left; page settings (title, address, SEO, admin) sit in a folded "Page settings" card at the top of the stack; the Pages list shows "Last edited by" (no author is stored) and has no checkbox column (no bulk actions yet); the top bar shows when the page was last saved (there's no autosave). Panels reorder only by drag (dnd-kit pointer) or arrow keys on the focused handle, with a live-region announcement. Deleting a panel offers Undo; Unpublish confirms in a dialog.
29. **Scheduled publishing runs in the database** (decided 2026-11-20). Scheduling validates like a publish, saves the working copy, and marks that revision `kind = 'schedule'` with `scheduled_for`; a pg_cron job (`cera-publish-due`, every minute) publishes due revisions. One schedule per page: scheduling again replaces it; publishing now, unpublishing or "Cancel schedule" cancels it, so an older snapshot can't go live over newer content. Edits made after scheduling stay unpublished. A schedule whose address went live on another page meanwhile is marked failed with the reason, and the Pages list flags it. Because the job runs outside Next, the cached live page catches up within its revalidate time (300 seconds; decision 25). Where pg_cron isn't available, call `publishDuePages()` from a cron route.

## Pattern: keep fields in their own file

A component that imports its own panel's type through `component: () => import('./X.tsx')` creates a circular type reference. Avoid it like this:

```ts
// blocks.fields.ts
export const blocksFields = { ...panelDefaults, blocks: f.repeater({...}), ... };
// Blocks.tsx
export default function Blocks({ data }: PanelPropsOf<typeof blocksFields>) { ... }
// blocks.ts (a core panel; a site's own panel uses definePanel and its own name)
export const blocks = defineCorePanel({ type: 'cera/blocks', label: 'Blocks', fields: blocksFields, component: () => import('./Blocks.tsx') });
```

## Implementation note: why `Field<…, S>` has no Zod constraint on `S`

Builders choose `ZodOptional<S>` / `ZodDefault<S>` / `S` from the options through a conditional type (`Finalize`). Zod 4's `ZodType` constraint rejects that deferred conditional inside a generic builder, so TypeScript widened the schema to `ZodType<unknown>` and every value inferred as `unknown`. The fix: `S` is unconstrained, value types come from `ValueOf<S>` (the schema's `_zod.output`), and `InferFields` is computed directly rather than through `z.ZodObject`. Builders pass explicit type arguments to `field<…>()`. Keep that pattern when adding builders. `test/types.test.ts` catches any regression.

## Field type mapping (PHP theme → `f.*`)

| Theme type | New | Status |
|---|---|---|
| `text`, `varchar` | `f.text()` | ✅ |
| `textarea` | `f.textarea()` | ✅ |
| `html`, `wp_editor`, `wp_editor_limited` | `f.html({ toolbar })` | ✅ sanitized on save. Import note: the theme stored `wp_editor` values without `<p>` tags and added them on output (`devo_autop`), so a WordPress importer must wrap paragraphs. |
| `url` | `f.url()` (relative paths allowed) | ✅ |
| `binary`, `toggle` | `f.toggle()` | ✅ |
| `int` | `f.number({ int: true })` | ✅ |
| `per_row` | `f.perRow()` | ✅ |
| `select` (static) | `f.select({ options })`, typed as a union of keys | ✅ |
| `select` / `select_multiple` with a callback | `f.selectFrom({ options: ctx => … , multiple })` | ✅ (needs a real `OptionsContext`) |
| `media` | `f.media({ accept })` | ✅ |
| `gallery` | `f.gallery()` | ✅ |
| `background` | `f.background()` | ⚠️ verify shape |
| `cta` / `ctas` | `f.cta()` / `f.ctas()` | ✅ |
| `icon` | `f.icon()` | ✅ (icon source still to decide) |
| `multi_array` (+ `limit`) | `f.repeater({ fields, limit })` | ✅ |
| `post_browser` (+ `post_types_field`) | `f.relation({ to: [...] \| { field } , limit })` | ✅ with a page picker in the admin (search, filtered by `to`) |
| `stats` | `stats()` | ⚠️ verify sub-fields |
| `*_callback` types | `custom(kind, schema)` | ✅ escape hatch |
| `accordion`, `image_link`, `image_size`, `post_type_labels`, `email`, `phone`, `radio`, `checkbox`, `button_select`, `range_slider`, `date_time`, `timezone`, `read_only`, `read_only_json`, `hidden`, `form` (relation to forms) | — | ❌ to port |

Look for `TODO(verify)` comments in the code. Those are guesses about the theme's field shapes that need checking against `class-form-field-*.php`.

## Next tasks, in order

The plan changed on 2026-11-16: build one panel (`blocks`) end to end before porting everything, so gaps in the core show up early.

**Done:** core data safety (decisions 14–15), the Supabase schema and save/load module (16–17), `<Panels>` as an async Server Component, and the example site (A below), checked in a browser against the local stack: live pages, metadata and JSON-LD, 404s, draft preview and exiting it.

**Next, to finish the `blocks` slice:**

A. ✅ **Next.js example site** (`examples/next-site`).
B. ✅ **Minimal admin** (`examples/next-site/app/admin`, editor in `src/admin`). Checked in a browser: sign-in, page list, editing a block inside the Blocks panel, save draft (live page unchanged), preview, publish, refusing to publish an empty title, the conflict message, and creating and publishing a new page. Not yet checked in a browser: unpublish (it asks for confirmation, which the test browser can't answer) and a viewer's read-only view.
   How it works: the editor edits the raw stored page (unknown panels and keys included) and upgrades known panels to their current version on load. Saves go through a server action that takes the user id from the verified session. Preview from the admin goes through `/admin/preview` (session-checked), so the preview secret stays on the server. A content type's `editor` option places boxes: `pageBoxes` go inside the Page section (landing page: `admin`), `leadBoxes` sit just above the panels, styled like one (landing page: `hero`), and the rest get their own sections in between (`seo`).
   Rich text: done (decision 27).
   Redesign and drag-to-reorder: done (decision 28). Scheduling: done (decision 29).
   Still to do for the admin: deleting pages, revision history, and client-side validation before save.
   Caching: done (decision 25).
C. ✅ **Panel data loading** (decision 19), proven with Featured Post: fields, `featured-post.load.ts` and a component ported from the theme (image optional, unlike the theme). The admin's page picker replaces pasted ids for `relation` fields: it searches pages as the signed-in user, respects `to` (fixed or a sibling field like Post Type), shows "Not published" on picks the live site won't show, and replaces the pick when `limit` is 1. Checked in a browser: the home page features About; picking Our Services and saving a draft changed only the preview.
   Not yet: `load` results aren't cached across requests, and a linked page doesn't know which pages feature it (so unpublishing it silently empties those panels).
D. ✅ **Sanitize `f.html()` on save** (decision 18). Checked in the admin: a script, an `onclick` and a `javascript:` link were removed on save, the editor showed the cleaned HTML with a warning under the field, and the preview rendered only the clean version. `savePage` now returns the stored page, and the editor switches to it after a save.
E. ✅ **Media uploads** (decision 23). Checked in the admin against the local stack: uploading a PNG (stored, recorded, measured 800 × 500), adding alt text, picking it from the library for the SEO image, saving a draft, and the preview rendering it with width, height and alt, plus `og:image`. A dropped SVG was refused with a message, and Storage itself refused a `text/html` upload made with a valid signed URL.
   Library editing (decision 26) is done: the admin's Media page. Checked in a browser against the local stack: an image used on `/developers-only` listed that page as live and couldn't be deleted; saving its alt text updated the library; a new upload showed "No pages use this file", and deleting it removed the row and the Storage object. Both the two-column and narrow layouts work.
   Not yet: cleaning up files that were uploaded but never finished or never used, image resizing (Supabase image transformations need a paid plan), paging past the newest 60 files in the library, and replacing a file in place.

**Then the original list:**

1. **Finish the field set.** Port the ❌ types above and resolve every `TODO(verify)`. Add a type assertion and a runtime test for each new builder.
2. **Port all panels.** The 15 types in `class-landing-page.php` → `set_panel_fields()`, plus the full Hero, SEO and Admin boxes. They go in `src/panels/` as `cera/<theme key>` with `defineCorePanel` (decision 20); three are there already. Use the `.fields.ts` pattern. Port components from `app/components/panels/`.
   *Done when:* every theme panel has a definition, `PanelData` types match what the existing React components consume, and `npm run check` passes.
   **Batch 1 done** (2026-11-20): `PanelFrame` (the theme's Panel + PanelWrapper: anchor id, background color/image/video with overlay, title, copy) and six panels: text, cta, quotes, featured-media, tabs, decision-tree. Blocks, Text + Media and Featured Post moved onto the frame, so they now draw their backgrounds. The example site's `/panels` page shows one of each. Differences from the theme: Quotes scrolls with CSS scroll snap instead of a slider script; CTA renders all its CTAs (the theme read one from a `ctas` field); Decision Tree's “CTA Text” + “CTA URL” are one `cta` field; Featured Media's `image_link` modal option isn't ported (no modals yet); a panel's anchor id isn't generated from its title.
   **Batch 2 done** (2026-11-20): accordion (WAI-ARIA accordion, one item open at a time), stats (numbers in the HTML, counted up on the client only when off screen at load and not for reduced motion) and gallery (a grid that opens images in a modal `<dialog>`, arrow keys between them), plus the admin's gallery picker (`GalleryInput`: upload several or drop them, pick several from the library, reorder, alt text per image). The theme's `accordion` and `stats` field types became repeaters. Differences: a gallery image's alt text doubles as its title (the theme had a separate title).
   **Posts done** (2026-11-20): cards for picked pages via `load` (like Featured Post: published, visible pages only on the live site, in the picked order), a per-row grid, and with Slider on and more pages than fit in a row, a scroll-snap row with Previous/Next buttons (`PostsSlider`). Not ported: “Modal”. The theme turned on its slider for more than three posts whatever the Slider field said; here the field decides.
   **Left:** form (needs the Form content type, a submissions table, spam protection and probably mail) and search (filters, A–Z, text search, sorting and paging across content types). Which comes first depends on the Developers Only astronomy content (decision 22).
3. **Content-type parity.** Port `class-simple-page.php`, `class-form.php`, `class-form-submission.php` and `class-icon.php` (custom icons; decision 21). Decide which `settings()` keys still matter (e.g. `archive_redirect`, `restrict_users`, `menu_position`) and list the rest as intentionally dropped.
4. **Supabase layer.** ✅ Pages, revisions, media, RLS and the save function are done. Media uploads are done (E above). Still to do: pruning old draft revisions, and a "restore revision" action.
5. **Admin form generator.** ✅ Basic version in `src/admin/fields.tsx`: one control per kind, labels, notes, live `maxLength` counters, issues next to fields, collapsible repeater items titled by `itemTitle`, panel picker and reordering. Unknown kinds show read-only and keep their value. Still to do: see B above, plus a way for sites to register their own controls for `custom()` kinds.
6. **Next.js integration.** Started in A and B above. Still to do after them: per-panel error boundaries (a client component) and admin route handlers packaged in `./next`.
7. **Packaging.** The package is `@lateraltranslucence/cera` with `.`, `./next`, `./panels`, `./supabase`, `./admin` and `./admin.css` entry points (already set up in `package.json`, currently pointing at source). Add a build step that emits JS and `.d.ts`, point `exports` at the output, and keep `.` free of React and Next imports. Then add the `create-cera` installer.

## Open questions for the project owner

None right now. Collisions, icons and the WordPress import were answered on 2026-11-19 (decisions 20–22).

## Unrelated issue in the current theme

`DO_Landing_Page::aftersave()` and the `BAK` queries in `DO_Custom_Post_Type::save_post()` build raw SQL by inserting values directly into the string. Switch them to `$wpdb->prepare()` on live sites. This is independent of this package.
