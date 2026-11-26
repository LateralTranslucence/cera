// Links editors type (CTAs, URL fields, image links): unsafe schemes are
// refused on publish, kept in drafts, and never rendered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { breadcrumbsFor, defineContentType, field, isSafeLink, linkScheme, preparePageForSave, safeHref } from '../src/index.ts';
import { CtaLink, CtaLinks } from '../src/panels/CtaLinks.tsx';

test('isSafeLink: paths, anchors and safe schemes; not what runs or loads, however it’s disguised', () => {
  for (const url of ['', 'about', '/about', '#team', '?q=1', 'https://example.com', 'HTTP://EXAMPLE.COM', 'mailto:a@example.com', 'tel:+1555', '//cdn.example.com/x', ' /padded ']) {
    assert.equal(isSafeLink(url), true, JSON.stringify(url));
  }
  for (const url of ['javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', '\u0001javascript:alert(1)', 'java\tscript:alert(1)', 'java\nscript:x', 'data:text/html,<b>', 'vbscript:x', 'file:///etc/passwd', '/a\u0000b']) {
    assert.equal(isSafeLink(url), false, JSON.stringify(url));
  }
  assert.equal(linkScheme(' java\tscript:x'), 'javascript');
  assert.equal(linkScheme('/about'), null);
});

test('safeHref: a leading slash for bare paths, nothing for empty or unsafe', () => {
  assert.deepEqual(
    ['about', '/about', '#x', 'https://example.com', '', '   ', 'javascript:alert(1)', undefined, null].map((url) => safeHref(url)),
    ['/about', '/about', '#x', 'https://example.com', undefined, undefined, undefined, undefined, undefined],
  );
});

const linkType = defineContentType({
  name: 'link_test',
  label: 'Link test',
  boxes: { links: { cta: field.cta(), ctas: field.ctas(), url: field.url(), image: field.imageLink() } },
});
const bad = 'javascript:alert(1)';
const page = (links: Record<string, unknown>) => ({ id: crypto.randomUUID(), contentType: 'link_test', slug: 'links', title: 'Links', boxes: { links }, panels: [] });

test('publishing refuses unsafe links in every link field; a draft keeps them with a warning', async () => {
  const stored = page({ cta: { text: 'Go', url: bad }, ctas: [{ text: 'Ok', url: '/ok' }, { text: 'Bad', url: bad }], url: bad, image: { url: bad } });
  const published = await preparePageForSave(linkType, stored, { mode: 'publish' });
  assert.equal(published.ok, false);
  if (!published.ok) {
    assert.deepEqual(
      published.issues.map((issue) => [issue.severity, issue.path.join('.')]),
      [['error', 'boxes.links.cta.url'], ['error', 'boxes.links.ctas.1.url'], ['error', 'boxes.links.url'], ['error', 'boxes.links.image.url']],
    );
  }
  const draft = await preparePageForSave(linkType, stored, { mode: 'draft' });
  assert.ok(draft.ok);
  if (draft.ok) {
    assert.equal(draft.issues.every((issue) => issue.severity === 'warning'), true);
    assert.deepEqual((draft.page.boxes.links as { url: string }).url, bad);
  }
  const fine = await preparePageForSave(linkType, page({ cta: { text: 'Go', url: 'contact' }, ctas: [], url: 'https://example.com', image: { url: '#top' } }), { mode: 'publish' });
  assert.equal(fine.ok, true);
});

test('rendering drops unsafe links: CTAs, and breadcrumbs keep their text without a link', () => {
  assert.equal(renderToStaticMarkup(createElement(CtaLink, { cta: { text: 'Bad', url: bad, target: '_self' } })), '');
  assert.equal(renderToStaticMarkup(createElement(CtaLinks, { ctas: [{ text: 'Bad', url: bad, target: '_self' }] })), '');
  assert.equal(
    renderToStaticMarkup(createElement(CtaLinks, { ctas: [{ text: 'Ok', url: 'about', target: '_blank' }, { text: 'Bad', url: ' javascript:x', target: '_self' }] })),
    '<p class="ctas"><a class="cta" href="/about" target="_blank" rel="noopener noreferrer">Ok</a></p>',
  );
  const withCrumbs = defineContentType({ name: 'crumbs', label: 'Crumbs', route: '/[slug]', boxes: {}, breadcrumbs: [{ text: 'Guides', url: 'guides' }, { text: 'Bad', url: bad }] });
  assert.deepEqual(
    breadcrumbsFor(withCrumbs, { id: 'x', contentType: 'crumbs', slug: 'a', title: 'A', boxes: {}, panels: [] } as never).map((crumb) => [crumb.text, crumb.url]),
    [['Guides', '/guides'], ['Bad', ''], ['A', '/a']],
  );
});
