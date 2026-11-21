// Next.js integration: each panel's error boundary, and the preview route handlers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { defineContentType, definePanel, field, readPage, type StoredPage } from '../src/index.ts';
import { PanelBoundary, Panels, createPreviewHandler, previewSecret } from '../src/next/index.ts';
import { returnPath } from '../src/next/preview.ts';
import { text } from '../src/panels/text.ts';

const exploding = definePanel({
  type: 'exploding',
  label: 'Exploding',
  fields: { title: field.text() },
  component: async () => ({
    default: () => {
      throw new Error('render failed');
    },
  }),
});
const contentType = defineContentType({ name: 'plain', label: 'Plain', route: '/[slug]', boxes: {}, panels: [text, exploding] });
const raw: StoredPage = {
  id: '00000000-0000-4000-8000-000000000009',
  contentType: 'plain',
  slug: 'boom',
  title: 'Boom',
  boxes: {},
  panels: [
    { id: 'one', type: 'cera/text', v: 1, data: { title: 'Before' } },
    { id: 'two', type: 'exploding', v: 1, data: {} },
    { id: 'three', type: 'cera/text', v: 1, data: { title: 'After' } },
  ],
};

async function render(showErrors?: boolean) {
  const { page } = readPage(contentType, raw);
  const quiet = console.error;
  console.error = () => {};
  try {
    return renderToStaticMarkup(await Panels({ contentType, page, ...(showErrors !== undefined && { showErrors }) }));
  } finally {
    console.error = quiet;
  }
}

test('a panel that throws while rendering is left out; the panels around it still render', async () => {
  const html = await render(false);
  assert.match(html, /Before/);
  assert.match(html, /After/);
  assert.doesNotMatch(html, /render failed|couldn’t be shown/);
  // Its place is an empty client-rendered boundary, filled by the error boundary in the browser.
  assert.ok(html.indexOf('Before') < html.indexOf('After'));
});

test('the boundary, once a panel has failed: a note in preview and development, nothing for visitors', () => {
  const failed = (showError: boolean) => {
    const boundary = new PanelBoundary({ type: 'exploding', label: 'Exploding', showError, children: null });
    boundary.state = PanelBoundary.getDerivedStateFromError();
    return renderToStaticMarkup(boundary.render());
  };
  assert.equal(failed(false), '');
  assert.equal(failed(true), '<div class="cera-panel-error" role="note" data-panel-type="exploding">The Exploding panel couldn’t be shown. Visitors see the page without it.</div>');
});

test('preview: only an allowed request with a good slug turns preview on', async () => {
  const refused = createPreviewHandler({ authorize: () => false });
  assert.equal((await refused.GET(new Request('http://localhost/api/draft?slug=about'))).status, 401);

  const signIn = Response.redirect('http://localhost/admin/login', 307);
  const redirected = createPreviewHandler({ authorize: async () => signIn });
  assert.equal(await redirected.GET(new Request('http://localhost/admin/preview?slug=about')), signIn);

  const allowed = createPreviewHandler({ authorize: () => true });
  for (const slug of ['../admin', 'About', 'a b', '']) {
    assert.equal((await allowed.GET(new Request(`http://localhost/admin/preview?slug=${encodeURIComponent(slug)}`))).status, 400, slug);
  }
});

test('preview secret: matches exactly; nothing matches when no secret is set', () => {
  const check = previewSecret(() => 'correct horse');
  const request = (secret?: string) => new Request(`http://localhost/api/draft${secret === undefined ? '' : `?secret=${encodeURIComponent(secret)}`}`);
  assert.equal(check(request('correct horse')), true);
  assert.equal(check(request('correct hors')), false);
  assert.equal(check(request('correct horse!')), false);
  assert.equal(check(request()), false);
  assert.equal(previewSecret(() => undefined)(request('')), false);
  assert.equal(previewSecret(() => '')(request('')), false);
});

test('leaving preview returns only to a path on this site', () => {
  assert.equal(returnPath('/about?x=1#top'), '/about?x=1#top');
  for (const path of [null, '', 'https://evil.test', '//evil.test', '/\\evil.test', 'about']) assert.equal(returnPath(path), '/', String(path));
});
