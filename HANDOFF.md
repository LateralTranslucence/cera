# Handoff: Cera core (field builder sketch)

**For:** Claude Code
**From:** LateralTranslucence
**Status:** Working sketch. `npm run check` passes (typecheck plus 8 tests).

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
| `extensions/README.md` | The extension model (auto-discovery; core wins on name collision) |
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
  panel.ts          definePanel, PanelData, PanelInstance (discriminated union), PanelPropsOf
  defaults.ts       panelDefaults (Title, Background, Copy, ID) + omit()
  content-type.ts   defineContentType, PageDocument, PageOf, runtime pageSchema
  migrate.ts        upgradePanel / upgradePagePanels (version → version migrations)
  document.ts       readPage (forgiving, for rendering) and preparePageForSave (keeps unknown data; draft vs publish; sanitizes rich text)
  sanitize.ts       rich-text allowlists (full / limited) on sanitize-html; loaded lazily by document.ts
  next/             the `/next` entry: async <Panels> Server Component, pageMetadata, jsonLdString; React lives only here
  supabase/         the `/supabase` entry: getPublishedPage, getDraftPage, getPageForEditing, listPages, savePage, unpublishPage,
                    createPageResolver (linked pages for panels' load: published-only live, working copies in preview)
  admin/            the `/admin` entry ('use client'): PageEditor, FieldMapForm (one control per field kind), state helpers;
                    `/admin.css` is its stylesheet, scoped under .cera-admin
supabase/
  config.toml              local stack (`supabase start`), ports 563xx
  migrations/…_cera_init.sql          cera_pages, cera_page_revisions, cera_media, RLS, cera_save_page / cera_unpublish_page
  migrations/…_cera_media_bucket.sql  public `cera-media` Storage bucket
examples/
  next-site/        npm workspace: Next.js 16 example site (see its README)
    cera/           the example panels (blocks, featured-post, text-media v2) and the landing_page content type;
                    they import '@lateraltranslucence/cera' like a real site, and the library tests use them too
  sample-page.json  a stored page row
test/
  types.test.ts     compile-time assertions on inferred types (Equal/Expect)
  runtime.test.ts   validation, defaults, migrations, hooks, guards
  document.test.ts  forgiving reads, lossless saves, draft vs publish, beforeSave
  sql.test.ts       the migrations: publishing, conflicts, roles, RLS
  supabase.test.ts  end to end: savePage → SQL → getPublishedPage / getPageForEditing
  render.test.ts    <Panels> output, hidden panels, a panel that fails to load
  metadata.test.ts  pageMetadata and JSON-LD escaping
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
10. **Panel `type` keys are kebab-case.** They match the theme's existing keys (`text-media`, `featured-post`), which makes content import straightforward.
11. **The page model keeps `boxes` (fixed groups) separate from `panels`.** This mirrors the theme's `default_meta_boxes: ['Hero','SEO','Admin']` versus the dynamic Panel box.
12. **Page concerns are typed functions,** not string syntax: `seo.title: p => p.boxes.seo.title || p.title` replaces `'SEO Title||post_title'`. Likewise `jsonLd` for schema.org, `hidden` for `hide_field`, and `hooks.beforeSave` / `hooks.afterSave` for `onsave_callback` / `aftersave_callback`.
13. **The name is Cera** (Latin for wax, as in Roman wax writing tablets). It ships as one package, `@lateraltranslucence/cera`, with subpath exports: `.` is the core (no React or Next imports) and `./next` is the renderer, admin and routes. React is an optional peer dependency. The installer is the unscoped `create-cera` (`npx create-cera`), which was free on npm on 2026-11-16. Shorter scopes (`@cera`, `@syndr`) were not available.
14. **Saves never lose data; reads never fail on content.** Field-map objects and repeater items are loose (unknown keys are kept). `preparePageForSave` writes back unknown panel types, unknown keys and retired boxes untouched. `readPage` falls back to a field's default when it fails, skips panels it can't repair or doesn't know, and reports issues instead of throwing. The admin loads pages with `getPageForEditing`, which returns the raw stored page, so it can't drop what it never saw.
15. **Drafts save with warnings; publishing requires valid fields.** A draft with an empty title or an invalid field still saves (the raw value is kept). Publishing turns those into errors. Bad slugs and duplicate panel ids are errors in both modes. `beforeSave` runs only on fully valid pages.
16. **Draft and live are separate.** `cera_pages` is the working copy; every save writes a `cera_page_revisions` row; the live page is the revision with `is_published`. Saving a draft never changes the live site. (The theme's "Update" went live immediately.)
17. **Browsers never write.** No insert/update/delete grants for `anon`/`authenticated`. The app server validates with `preparePageForSave` and calls `cera_save_page` with the service role, passing the user id from a verified session; the function re-checks that the user is an admin or editor. Roles live in `app_metadata.cera_role` (`admin | editor | viewer`), which users can't set themselves. Saves use optimistic locking (`expectedVersion`).
18. **Rich text is stored as sanitized HTML** (decided 2026-11-19), not structured JSON. Existing WordPress content is HTML, and the toolbars are small enough for an allowlist. `preparePageForSave` sanitizes every `f.html()` value (repeaters included) with `sanitize-html`: the `full` toolbar follows `wp_kses_post` minus inline styles (headings, lists, links, images over http(s), tables, `class`); `limited` follows WordPress's "teeny" toolbar (bold, italic, underline, strikethrough, blockquote, lists, links). Links allow http(s), mailto, tel and relative paths; `target="_blank"` gets `rel="noopener noreferrer"`. Anything removed becomes an `html-sanitized` warning, which never blocks a save. Panels of unknown types aren't sanitized (they aren't rendered). Rendering trusts stored HTML because of this and decision 17.
19. **Panels load their own data on the server.** `definePanel({ load })` runs before render in `<Panels>` (in parallel with the component import); its awaited result is the component's `loaded` prop, typed from `load`'s return (`PanelPropsOf<typeof fields, Loaded>`). Panels without `load` have no `loaded` prop. Keep `load` in its own `*.load.ts` file, like the fields, so the component can import the result type. `load` gets `ctx.pages.byIds()` (a `PageResolver`) and `ctx.draft`; sites build the resolver with `createPageResolver`. On the live site it returns only published, visible pages, so a panel can't leak a draft or a hidden page; in preview it returns working copies. A failing `load` skips that panel, not the page. Linked pages carry title, URL (content type `url`, default `route`), type label, and the content type's SEO description and image.

## Pattern: keep fields in their own file

A component that imports its own panel's type through `component: () => import('./X.tsx')` creates a circular type reference. Avoid it like this:

```ts
// blocks.fields.ts
export const blocksFields = { ...panelDefaults, blocks: f.repeater({...}), ... };
// Blocks.tsx
export default function Blocks({ data }: PanelPropsOf<typeof blocksFields>) { ... }
// blocks.ts
export const blocks = definePanel({ type: 'blocks', label: 'Blocks', fields: blocksFields, component: () => import('./Blocks.tsx') });
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
   Still to do for the admin: drag-to-reorder (buttons for now), a media library with uploads (paths are typed by hand), a page picker for `relation`, a rich-text editor for `f.html()`, deleting pages, revision history, and client-side validation before save.
   Also still to do: replace `force-dynamic` with cached pages plus `revalidateTag` on publish.
C. ✅ **Panel data loading** (decision 19), proven with Featured Post: fields, `featured-post.load.ts` and a component ported from the theme (image optional, unlike the theme). The admin's page picker replaces pasted ids for `relation` fields: it searches pages as the signed-in user, respects `to` (fixed or a sibling field like Post Type), shows "Not published" on picks the live site won't show, and replaces the pick when `limit` is 1. Checked in a browser: the home page features About; picking Our Services and saving a draft changed only the preview.
   Not yet: `load` results aren't cached across requests, and a linked page doesn't know which pages feature it (so unpublishing it silently empties those panels).
D. ✅ **Sanitize `f.html()` on save** (decision 18). Checked in the admin: a script, an `onclick` and a `javascript:` link were removed on save, the editor showed the cleaned HTML with a warning under the field, and the preview rendered only the clean version. `savePage` now returns the stored page, and the editor switches to it after a save.

**Then the original list:**

1. **Finish the field set.** Port the ❌ types above and resolve every `TODO(verify)`. Add a type assertion and a runtime test for each new builder.
2. **Port all panels.** The 15 types in `class-landing-page.php` → `set_panel_fields()`, plus the full Hero, SEO and Admin boxes. Use the `.fields.ts` pattern. Port components from `app/components/panels/`.
   *Done when:* every theme panel has a definition, `PanelData` types match what the existing React components consume, and `npm run check` passes.
3. **Content-type parity.** Port `class-simple-page.php`, `class-form.php`, `class-form-submission.php` and `class-icon.php`. Decide which `settings()` keys still matter (e.g. `archive_redirect`, `restrict_users`, `menu_position`) and list the rest as intentionally dropped.
4. **Supabase layer.** ✅ Pages, revisions, media, RLS and the save function are done. Still to do: media uploads (server route writing to `cera-media` and `cera_media`), pruning old draft revisions, and a "restore revision" action.
5. **Admin form generator.** ✅ Basic version in `src/admin/fields.tsx`: one control per kind, labels, notes, live `maxLength` counters, issues next to fields, collapsible repeater items titled by `itemTitle`, panel picker and reordering. Unknown kinds show read-only and keep their value. Still to do: see B above, plus a way for sites to register their own controls for `custom()` kinds.
6. **Next.js integration.** Started in A and B above. Still to do after them: per-panel error boundaries (a client component) and admin route handlers packaged in `./next`.
7. **Packaging.** The package is `@lateraltranslucence/cera` with `.`, `./next`, `./supabase`, `./admin` and `./admin.css` entry points (already set up in `package.json`, currently pointing at source). Add a build step that emits JS and `.d.ts`, point `exports` at the output, and keep `.` free of React and Next imports. Then add the `create-cera` installer.

## Open questions for the project owner

- Should the extension model stay "core wins on collision", or should sites be able to override core panels?
- Icons: keep an icon content type as in the theme, or use a bundled icon set?
- Migrating content from existing WordPress client sites: wanted, and if so for which sites first?

## Unrelated issue in the current theme

`DO_Landing_Page::aftersave()` and the `BAK` queries in `DO_Custom_Post_Type::save_post()` build raw SQL by inserting values directly into the string. Switch them to `$wpdb->prepare()` on live sites. This is independent of this package.
