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

Run `npm install && npm run check`. **Start with [HANDOFF.md](./HANDOFF.md).**
