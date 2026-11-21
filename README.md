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

## A new site

`packages/create-cera` makes a new Next.js site from the example: its content types, admin, routes, Supabase settings and Cera's migrations.

```bash
npm run sync --prefix packages/create-cera
node packages/create-cera/index.mjs ../my-site --cera "$PWD"
```

Neither package is published yet; once they are, that becomes `npm create cera my-site`.

**Start with [HANDOFF.md](./HANDOFF.md).**
