// Compile-time assertions (checked by `npm run typecheck`) + a trivial runtime test so node --test picks it up.
import { test } from 'node:test';
import type { CTA, LinkedPage, MediaRef, PageOf, PanelData, PanelDefinition, PanelPropsOf } from '../src/index.ts';
import type { blocksFields } from '../src/panels/blocks.fields.ts';
import type { blocks } from '../src/panels/blocks.ts';
import type { featuredPost } from '../src/panels/featured-post.ts';
import type { decisionTree } from '../src/panels/decision-tree.ts';
import type { landingPage } from '../examples/next-site/cera/content-types/landing-page.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type Blocks = PanelData<typeof blocks>;
type Featured = PanelData<typeof featuredPost>;
type DecisionTree = PanelData<typeof decisionTree>;
type Page = PageOf<typeof landingPage>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LoadedOf<P> = P extends PanelDefinition<any, any, infer L> ? L : never;

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
  Expect<
    Equal<
      Page['panels'][number]['type'],
      | 'cera/accordion'
      | 'cera/blocks'
      | 'cera/cta'
      | 'cera/decision-tree'
      | 'cera/featured-media'
      | 'cera/featured-post'
      | 'cera/gallery'
      | 'cera/quotes'
      | 'cera/stats'
      | 'cera/tabs'
      | 'cera/text'
      | 'cera/text-media'
    >
  >,
  // nested repeaters keep their item types
  Expect<Equal<DecisionTree['cards'][number]['list'][number]['url'], string | undefined>>,
  Expect<Equal<DecisionTree['cards'][number]['cta'], CTA | undefined>>,
  // load(): its awaited result is inferred and becomes the component's `loaded` prop
  Expect<Equal<LoadedOf<typeof featuredPost>, { page: LinkedPage | null }>>,
  // panels without load() have no `loaded` prop at all
  Expect<Equal<'loaded' extends keyof PanelPropsOf<typeof blocksFields> ? true : false, false>>,
];

// Narrowing on `type` gives the right data shape.
export function narrow(p: Page['panels'][number]) {
  if (p.type === 'cera/blocks') {
    const n: number = p.data.perRow;
    return n;
  }
  if (p.type === 'cera/text-media') {
    const a: 'left' | 'right' | 'alternate' = p.data.alignment;
    return a;
  }
  if (p.type === 'cera/featured-post') return p.data.linkTarget;
  return null;
}

// @ts-expect-error — not an option key
export const badStyle: Blocks['style'] = 'grid';

test('type assertions compile (see npm run typecheck)', () => {});
