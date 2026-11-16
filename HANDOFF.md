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
npm run check      # tsc --noEmit + node --test (via tsx)
```

Versions used: TypeScript 7.0, Zod 4.6, React 19, Node 22+.

## Layout

```
src/
  fields.ts         f.* builders, Field type, InferFields, MediaRef/CTA/Background schemas
  panel.ts          definePanel, PanelData, PanelInstance (discriminated union), PanelPropsOf
  defaults.ts       panelDefaults (Title, Background, Copy, ID) + omit()
  content-type.ts   defineContentType, PageDocument, PageOf, runtime pageSchema
  migrate.ts        upgradePanel / upgradePagePanels (version → version migrations)
  next/             the `/next` entry: <Panels> renderer (sketch); React lives only here
examples/
  panels/           blocks (+ fields file + component), featured-post, text-media (v2 with a migration)
  content-types/    landing-page (ported DO_Landing_Page)
  sample-page.json  a stored page row
test/
  types.test.ts     compile-time assertions on inferred types (Equal/Expect)
  runtime.test.ts   validation, defaults, migrations, hooks, guards
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
| `html`, `wp_editor`, `wp_editor_limited` | `f.html({ toolbar })` | ✅ (sanitizing still to do) |
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
| `post_browser` (+ `post_types_field`) | `f.relation({ to: [...] \| { field } , limit })` | ✅ |
| `stats` | `stats()` | ⚠️ verify sub-fields |
| `*_callback` types | `custom(kind, schema)` | ✅ escape hatch |
| `accordion`, `image_link`, `image_size`, `post_type_labels`, `email`, `phone`, `radio`, `checkbox`, `button_select`, `range_slider`, `date_time`, `timezone`, `read_only`, `read_only_json`, `hidden`, `form` (relation to forms) | — | ❌ to port |

Look for `TODO(verify)` comments in the code. Those are guesses about the theme's field shapes that need checking against `class-form-field-*.php`.

## Next tasks, in order

1. **Finish the field set.** Port the ❌ types above and resolve every `TODO(verify)`. Add a type assertion and a runtime test for each new builder.
2. **Port all panels.** The 15 types in `class-landing-page.php` → `set_panel_fields()`, plus the full Hero, SEO and Admin boxes. Use the `.fields.ts` pattern. Port components from `app/components/panels/`.
   *Done when:* every theme panel has a definition, `PanelData` types match what the existing React components consume, and `npm run check` passes.
3. **Content-type parity.** Port `class-simple-page.php`, `class-form.php`, `class-form-submission.php` and `class-icon.php`. Decide which `settings()` keys still matter (e.g. `archive_redirect`, `restrict_users`, `menu_position`) and list the rest as intentionally dropped.
4. **Supabase layer.** Write SQL migrations for `pages` (with `boxes jsonb` and `panels jsonb`), `page_revisions` (written on every save; this replaces the theme's `BAK` meta keys), and `media` (Storage-backed). Add RLS policies for admin, editor and viewer roles, and validate with `pageSchema` on write.
5. **Admin form generator.** Build a widget registry keyed by `field.kind` that renders forms from any `FieldMap`. Use `meta.label`, `meta.note` and `meta.maxLength` (live counter). Repeaters need drag-to-reorder (dnd-kit) and collapsed item titles via `itemTitle`. Include the panel picker and panel reordering.
6. **Next.js integration.** Admin route handler and pages, a server-side page loader (fetch → `upgradePagePanels` → `pageSchema.parse`), `<Panels>` as a Server Component with client panels marked as such, draft-mode preview, and `generateMetadata` from `seo`/`jsonLd`.
7. **Packaging.** The package is `@lateraltranslucence/cera` with `.` and `./next` entry points (already set up in `package.json`, currently pointing at source). Add a build step that emits JS and `.d.ts`, point `exports` at the output, and keep `.` free of React and Next imports. Then add the `create-cera` installer.

## Open questions for the project owner

- Should the extension model stay "core wins on collision", or should sites be able to override core panels?
- Icons: keep an icon content type as in the theme, or use a bundled icon set?
- Rich text storage: sanitized HTML (as the theme does) or structured JSON (Tiptap/Lexical)?
- Migrating content from existing WordPress client sites: wanted, and if so for which sites first?

## Unrelated issue in the current theme

`DO_Landing_Page::aftersave()` and the `BAK` queries in `DO_Custom_Post_Type::save_post()` build raw SQL by inserting values directly into the string. Switch them to `$wpdb->prepare()` on live sites. This is independent of this package.
