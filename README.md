# Cera (sketch)

The typed core of a panel-based CMS for Next.js and Supabase, successor to the Developers Only WordPress theme.

```ts
const blocks = definePanel({
  type: 'blocks',
  label: 'Blocks',
  fields: {
    ...panelDefaults,
    blocks: field.repeater({ fields: { title: field.text(), cta: field.cta() } }),
    perRow: field.perRow(),
    style: field.select({ options: { card: 'Card', plain: 'Plain' }, default: 'card' }),
  },
  component: () => import('./Blocks.tsx'), // props are inferred from `fields`
});
```

## Working on it

```bash
npm install
npm run check        # typecheck and tests (PGlite, no Docker needed)
npm run build        # the package, into dist/ (JavaScript and type definitions)
npm run dev          # rebuilds on change and serves the example site (see examples/next-site)
```

Inside this repository, the package's own imports resolve to `src/` through the `source` export condition (tsconfig's `customConditions`, `node --conditions=source`); everyone else gets `dist/`.

## Adding a content type

A site's content types live in `cera/content-types/`, one file each. A new one needs:

1. **The definition:** `cera/content-types/case-study.ts`, a `defineContentType` call. It covers its fields (`boxes`) and panels, its `route` (e.g. `/case-studies/[slug]`), SEO and JSON-LD, and how the admin shows it (`editor`: its sidebar icon, group, address and names). Field labels are optional: `imageCredit: field.text()` is labeled "Image credit".
2. **A view,** if it has pages of its own: `components/CaseStudyView.tsx`, given `{ page, loadContext }`.
3. **One line each** in `cera/index.ts` (`contentTypes`) and `cera/views.ts` (`case_study: CaseStudyView`).

The admin builds the type's sidebar entry, list, new and edit screens from the definition (`createAdminScreens`). The site's catch-all route serves its pages at their `route` (`matchRoute`).

## A new site

`packages/create-cera` makes a new Next.js site from the example (its content types, admin, routes, Supabase settings and Cera's migrations) and gets it running. From this repository:

```bash
npm run new-site -- ../my-site
```

That refreshes the template, builds the package, and packs it into the new site as `vendor/cera.tgz`, so the site has its own copy of Cera: it runs and deploys without this checkout. Then it installs the site, starts its own local Supabase stack on free ports (so it runs next to Cera's and other sites'), writes `.env.local`, seeds an admin account, pages and menus, and makes the first git commit. It ends by printing the admin address and the account. It needs Docker running and the Supabase CLI; without them it stops after installing and lists what's left. `--no-start`, `--no-install` and `--no-git` skip parts.

Later, to bring the site up to this checkout's Cera (the package, and any new migrations):

```bash
npm run update-site -- ../my-site
```

Neither package is published yet; once they are, that becomes `npm create cera my-site`, and updating is `npm install @lateraltranslucence/cera@latest`.

**Start with [HANDOFF.md](./HANDOFF.md).**
