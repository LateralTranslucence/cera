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

The admin (`createCera`, in `cera/admin.tsx`) builds the type's sidebar entry, list, new and edit screens from the definition. The site's catch-all route serves its pages at their `route` (`matchRoute`).

## A new site

`packages/create-cera` makes a new Next.js site from the example (its content types, admin, routes, Supabase settings and Cera's migrations) and gets it running. From this repository:

```bash
npm run new-site -- ../my-site
```

That refreshes the template, builds the package, and packs it into the new site as `vendor/cera.tgz`, so the site has its own copy of Cera: it runs and deploys without this checkout. Then it installs the site, starts its own local Supabase stack on free ports (so it runs next to Cera's and other sites'), writes `.env.local`, seeds an admin account, pages and menus, and makes the first git commit. It ends by printing the admin address and the account. It starts Docker if needed (see below); if Docker can't run, it stops after installing and lists what's left. `--no-start`, `--no-install` and `--no-git` skip parts.

Later, to bring the site up to this checkout's Cera (the package, and any new migrations):

```bash
npm run update-site -- ../my-site
```

Once a version is released (below), anyone can make a site without this checkout, with only Node installed:

```bash
npm create cera my-site
```

The Supabase CLI comes with each site (`npx supabase`). The local database runs in Docker: `create-cera` starts Docker when it's stopped; when it's missing, it offers to install Docker Desktop with Homebrew on a Mac (on a yes), or opens the download page and carries on once Docker runs.

To put a new site online, run `npm run go-live` in it: it creates (or uses) a Supabase project, applies the migrations, makes the first admin account, and sets up and deploys a Vercel project, asking as it goes (`-- --dry-run` shows the steps without doing them).

A site made that way depends on the released `@lateraltranslucence/cera`; update it with `npm install @lateraltranslucence/cera@latest` and copy in any new migrations.

## Releasing

Both packages, `@lateraltranslucence/cera` and `create-cera`, are published publicly to npm (MIT) by `.github/workflows/release.yml` when a version tag is pushed. Tag a commit on `main`:

```bash
git tag v0.3.0
git push origin v0.3.0
```

The workflow signs in to npm with the `NPM_TOKEN` repository secret when it's set, or else with npm's trusted publishing (no secret): on npmjs.com, each package's settings name this repository and `release.yml` as a trusted publisher. Trusted publishing can only be set up on a package that exists, so the first release uses a token; after it, set up trusted publishing for both packages and delete the secret.

The workflow checks the tag is a version and on `main`, runs the tests, sets both packages to that version, builds them and publishes them. The `package.json` versions in the repository stay at 0.0.0: the tag is the version. A pre-release (`v0.4.0-beta.1`) is published under `next`, so `@latest` never installs it.

**Start with [HANDOFF.md](./HANDOFF.md).**

## License

MIT. See [LICENSE](./LICENSE).
