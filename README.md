# Cera (sketch)

The typed core of a panel-based CMS for Next.js and Supabase, successor to the Developers Only WordPress theme.

```ts
const blocks = definePanel({
  type: 'blocks',
  label: 'Blocks',
  fields: {
    ...panelDefaults,
    blocks: f.repeater({ fields: { title: f.text(), cta: f.cta() } }),
    perRow: f.perRow(),
    style: f.select({ options: { card: 'Card', plain: 'Plain' }, default: 'card' }),
  },
  component: () => import('./Blocks.tsx'), // props are inferred from `fields`
});
```

Run `npm install && npm run check`. **Start with [HANDOFF.md](./HANDOFF.md).**
