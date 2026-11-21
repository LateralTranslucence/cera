// Panels that load data on the server: <Panels> runs load() and passes `loaded`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { defineContentType, definePanel, field, readPage, type LinkedPage, type LoadContext, type PageResolver, type StoredPage } from '../src/index.ts';
import { Panels } from '../src/next/index.ts';
import { landingPage } from '../examples/next-site/cera/content-types/landing-page.ts';
import sample from '../examples/sample-page.json' with { type: 'json' };

const ABOUT = '00000000-0000-4000-8000-0000000000aa';

const about: LinkedPage = {
  id: ABOUT,
  contentType: 'landing_page',
  contentTypeLabel: 'Landing Page',
  slug: 'about',
  title: 'About us',
  url: '/about',
  description: 'Who we are.',
};

function resolver(pages: LinkedPage[], calls: string[][] = []): PageResolver {
  return {
    async byIds(ids) {
      calls.push([...ids]);
      return ids.map((id) => pages.find((page) => page.id === id)).filter((page): page is LinkedPage => !!page);
    },
  };
}

function pageWithFeatured(data: Record<string, unknown>) {
  const raw = structuredClone(sample) as unknown as StoredPage;
  raw.panels = [{ id: 'fp', type: 'cera/featured-post', v: 1, data }];
  return readPage(landingPage, raw).page;
}

async function render(page: ReturnType<typeof pageWithFeatured>, pages: PageResolver | undefined, errors: string[] = []) {
  const element = await Panels({ contentType: landingPage, page, loadContext: pages && { pages, draft: false }, onError: (error) => errors.push(String(error)) });
  return renderToStaticMarkup(element);
}

test('Featured Post shows the linked page: type, title, description and link', async () => {
  const calls: string[][] = [];
  const html = await render(pageWithFeatured({ post: [ABOUT] }), resolver([about], calls));
  assert.deepEqual(calls, [[ABOUT]]);
  assert.match(html, /<p class="featured-post__pretitle">Landing Page<\/p>/);
  assert.match(html, /<h2>About us<\/h2>/);
  assert.match(html, /<p class="featured-post__excerpt">Who we are.<\/p>/);
  assert.match(html, /<a class="cta" href="\/about">Read more<\/a>/);
});

test('overrides win over the linked page', async () => {
  const html = await render(
    pageWithFeatured({
      post: [ABOUT],
      overrideTitle: 'Meet the team',
      overridePretitle: 'People',
      overrideDescription: '<p>Hello <strong>there</strong></p>',
      overrideCtaText: 'Say hi',
      overrideUrl: 'https://example.test/team',
      linkTarget: '_blank',
    }),
    resolver([about]),
  );
  assert.match(html, /People/);
  assert.match(html, /<h2>Meet the team<\/h2>/);
  assert.match(html, /<strong>there<\/strong>/);
  assert.match(html, /<a class="cta" href="https:\/\/example.test\/team" target="_blank" rel="noopener noreferrer">Say hi<\/a>/);
});

test('a linked page that does not resolve (unpublished, deleted) renders nothing unless overridden', async () => {
  assert.equal(await render(pageWithFeatured({ post: [ABOUT] }), resolver([])), '');
  assert.equal(await render(pageWithFeatured({}), resolver([about])), '');
  assert.match(await render(pageWithFeatured({ post: [ABOUT], overrideTitle: 'Still here' }), resolver([])), /Still here/);
});

test('a load that fails, or no loadContext, skips just that panel', async () => {
  const errors: string[] = [];
  const failing: PageResolver = { byIds: async () => { throw new Error('db down'); } };
  const raw = structuredClone(sample) as unknown as StoredPage;
  raw.panels.unshift({ id: 'fp', type: 'cera/featured-post', v: 1, data: { post: [ABOUT] } });
  const page = readPage(landingPage, raw).page;

  const html = await render(page, failing, errors);
  assert.match(html, /panel--blocks/); // the rest of the page still renders
  assert.doesNotMatch(html, /featured-post/);
  assert.match(errors[0]!, /db down/);

  const errors2: string[] = [];
  await render(page, undefined, errors2);
  assert.match(errors2[0]!, /no loadContext/);
});

test('load gets the panel data and context (page, panel, draft)', async () => {
  let seen: { data: unknown; context: Omit<LoadContext, 'pages'> } | undefined;
  const probe = definePanel({
    type: 'probe',
    label: 'Probe',
    fields: { n: field.number({ default: 7 }) },
    load: (data, context) => {
      seen = { data, context: { draft: context.draft, page: context.page, panel: context.panel } };
      return { doubled: data.n * 2 };
    },
    component: async () => ({ default: ({ loaded }: { loaded: { doubled: number } }) => createElement('b', null, loaded.doubled) }),
  });
  const contentType = defineContentType({ name: 'landing_page', label: 'x', route: '/[slug]', boxes: {}, panels: [probe] });
  const page = readPage(contentType, { id: 'p1', contentType: 'landing_page', slug: 'x', panels: [{ id: 'a', type: 'probe', v: 1, data: {} }] }).page;
  const html = renderToStaticMarkup(await Panels({ contentType, page, loadContext: { pages: resolver([]), draft: true } }));
  assert.equal(html, '<b>14</b>');
  assert.deepEqual(seen, {
    data: { n: 7 },
    context: { draft: true, page: { id: 'p1', contentType: 'landing_page', slug: 'x' }, panel: { pageId: 'p1', panelId: 'a', index: 0, contentType: 'landing_page' } },
  });
});

function pageWithPosts(data: Record<string, unknown>) {
  const raw = structuredClone(sample) as unknown as StoredPage;
  raw.panels = [{ id: 'ps', type: 'cera/posts', v: 1, data }];
  return readPage(landingPage, raw).page;
}

const MARS = '00000000-0000-4000-8000-0000000000bb';
const mars: LinkedPage = {
  id: MARS,
  contentType: 'landing_page',
  contentTypeLabel: 'Landing Page',
  slug: 'mars',
  title: 'Mars',
  url: '/mars',
  image: { id: 'i', path: '2026/11/mars.png', kind: 'image', width: 800, height: 500 },
};
const HIDDEN = '00000000-0000-4000-8000-0000000000cc';

test('Posts: one card per page, in the picked order; pages that don’t resolve are left out', async () => {
  const calls: string[][] = [];
  const html = await render(pageWithPosts({ title: 'Read next', posts: [MARS, HIDDEN, ABOUT], perRow: 2 }), resolver([about, mars], calls));
  assert.deepEqual(calls, [[MARS, HIDDEN, ABOUT]]);
  assert.match(html, /<ul class="posts" style="--per-row:2">/);
  assert.deepEqual([...html.matchAll(/class="post-card__link">([^<]+)</g)].map((match) => match[1]), ['Mars', 'About us']);
  assert.match(html, /<li class="post-card"><img class="post-card__image" src="[^"]*2026\/11\/mars\.png" alt="" width="800" height="500" loading="lazy"\/>/);
  assert.match(html, /<p class="post-card__type">Landing Page<\/p><h3><a href="\/about" class="post-card__link">About us<\/a><\/h3><p class="post-card__description">Who we are\.<\/p>/);
});

test('Posts: the slider needs more pages than fit in a row; no pages, no panel', async () => {
  const pages = resolver([about, mars]);
  assert.match(await render(pageWithPosts({ title: 'More', posts: [MARS, ABOUT], perRow: 1, slider: true }), pages), /<div class="posts-slider" role="region" aria-label="More: posts"><ul class="posts posts--slider"/);
  // Two cards fit in a row of three: a plain grid.
  assert.doesNotMatch(await render(pageWithPosts({ posts: [MARS, ABOUT], slider: true }), pages), /posts-slider/);
  assert.equal(await render(pageWithPosts({ title: 'Empty', posts: [HIDDEN] }), pages), '');
  assert.equal(await render(pageWithPosts({ title: 'Empty' }), pages), '');
});
