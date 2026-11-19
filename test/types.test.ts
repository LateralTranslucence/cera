// Compile-time assertions (checked by `npm run typecheck`) + a trivial runtime test so node --test picks it up.
import { test } from 'node:test';
import type { CTA, MediaRef, PageOf, PanelData } from '../src/index.ts';
import type { blocks } from '../examples/next-site/cera/panels/blocks.ts';
import type { featuredPost } from '../examples/next-site/cera/panels/featured-post.ts';
import type { landingPage } from '../examples/next-site/cera/content-types/landing-page.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type Blocks = PanelData<typeof blocks>;
type Featured = PanelData<typeof featuredPost>;
type Page = PageOf<typeof landingPage>;

export type _tests = [
  // optional text
  Expect<Equal<Blocks['title'], string | undefined>>,
  // toggle / perRow / select-with-default are always present
  Expect<Equal<Blocks['perRow'], number>>,
  Expect<Equal<Blocks['style'], 'card' | 'plain'>>,
  // repeater items: stable _id + inferred sub-fields
  Expect<Equal<Blocks['blocks'][number]['_id'], string>>,
  Expect<Equal<Blocks['blocks'][number]['hidden'], boolean>>,
  Expect<Equal<Blocks['blocks'][number]['cta'], CTA | undefined>>,
  Expect<Equal<Blocks['ctas'], CTA[]>>,
  // omit() removed defaults
  Expect<Equal<'title' extends keyof Featured ? true : false, false>>,
  Expect<Equal<Featured['postTypes'], string[]>>,
  Expect<Equal<Featured['post'], string[]>>,
  Expect<Equal<Featured['linkTarget'], '_self' | 'modal' | '_blank'>>,
  // boxes are typed per content type
  Expect<Equal<Page['boxes']['seo']['image'], MediaRef | undefined>>,
  Expect<Equal<Page['boxes']['admin']['schemaType'], 'WebPage' | 'AboutPage' | 'ContactPage' | 'SearchResultsPage'>>,
  // panels are a discriminated union
  Expect<Equal<Page['panels'][number]['type'], 'blocks' | 'featured-post' | 'text-media'>>,
];

// Narrowing on `type` gives the right data shape.
export function narrow(p: Page['panels'][number]) {
  if (p.type === 'blocks') {
    const n: number = p.data.perRow;
    return n;
  }
  if (p.type === 'text-media') {
    const a: 'left' | 'right' | 'alternate' = p.data.alignment;
    return a;
  }
  return p.data.linkTarget;
}

// @ts-expect-error — not an option key
export const badStyle: Blocks['style'] = 'grid';

test('type assertions compile (see npm run typecheck)', () => {});
