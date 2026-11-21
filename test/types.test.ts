// Compile-time assertions (checked by `npm run typecheck`) + a trivial runtime test so node --test picks it up.
import { test } from 'node:test';
import type { CTA, ImageLink, InferFields, LinkedPage, MediaRef, PageOf, PanelData, PanelDefinition, PanelPropsOf } from '../src/index.ts';
import { field } from '../src/index.ts';
import type { textMedia } from '../src/panels/text-media.panel.ts';
import type { blocksFields } from '../src/panels/blocks.fields.ts';
import type { blocks } from '../src/panels/blocks.panel.ts';
import type { featuredPost } from '../src/panels/featured-post.panel.ts';
import type { decisionTree } from '../src/panels/decision-tree.panel.ts';
import type { landingPage } from '../examples/next-site/cera/content-types/landing-page.ts';

type Equal<Actual, Expected> = (<Probe>() => Probe extends Actual ? 1 : 2) extends <Probe>() => Probe extends Expected ? 1 : 2 ? true : false;
type Expect<Condition extends true> = Condition;

type Blocks = PanelData<typeof blocks>;
type Featured = PanelData<typeof featuredPost>;
type DecisionTree = PanelData<typeof decisionTree>;
type Page = PageOf<typeof landingPage>;
type TextMedia = PanelData<typeof textMedia>;
const newFields = { email: field.email(), phone: field.phone({ required: true }), when: field.dateTime(), zone: field.timezone({ default: 'UTC' }), link: field.imageLink() };
type NewFields = InferFields<typeof newFields>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LoadedOf<Definition> = Definition extends PanelDefinition<any, any, infer Loaded> ? Loaded : never;

export type _tests = [
  // the last field types (decision 37)
  Expect<Equal<NewFields['email'], string | undefined>>,
  Expect<Equal<NewFields['phone'], string>>,
  Expect<Equal<NewFields['when'], string | undefined>>,
  Expect<Equal<NewFields['zone'], string>>,
  Expect<Equal<NewFields['link'], ImageLink | undefined>>,
  Expect<Equal<ImageLink, { url: string; modal: boolean }>>,
  Expect<Equal<TextMedia['imageSize'], 'vertical' | 'cinema' | 'square'>>,
  Expect<Equal<TextMedia['imageLink'], ImageLink | undefined>>,
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
      | 'cera/form'
      | 'cera/gallery'
      | 'cera/posts'
      | 'cera/quotes'
      | 'cera/search'
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
export function narrow(panel: Page['panels'][number]) {
  if (panel.type === 'cera/blocks') {
    const perRow: number = panel.data.perRow;
    return perRow;
  }
  if (panel.type === 'cera/text-media') {
    const alignment: 'left' | 'right' | 'alternate' = panel.data.alignment;
    return alignment;
  }
  if (panel.type === 'cera/featured-post') return panel.data.linkTarget;
  return null;
}

// @ts-expect-error — not an option key
export const badStyle: Blocks['style'] = 'grid';

test('type assertions compile (see npm run typecheck)', () => {});
