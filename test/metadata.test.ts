import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPage, type StoredPage } from '../src/index.ts';
import { jsonLdString, pageMetadata } from '../src/next/index.ts';
import { landingPage } from '../examples/next-site/cera/content-types/landing-page.ts';
import sample from '../examples/sample-page.json' with { type: 'json' };

const load = (edit: (stored: StoredPage) => void = () => {}) => {
  const raw = structuredClone(sample) as unknown as StoredPage;
  edit(raw);
  return readPage(landingPage, raw).page;
};

test('metadata comes from the content type seo functions', () => {
  const meta = pageMetadata(landingPage, load());
  assert.deepEqual(meta, {
    title: 'About',
    description: 'Who we are.',
    openGraph: { title: 'About', description: 'Who we are.' },
  });
});

test('SEO image goes through mediaUrl; noindex and hidden pages are not indexed', () => {
  const page = load((stored) => {
    stored.boxes.seo!.image = { id: 'm1', path: 'og/about.jpg', width: 1200, height: 630 };
    stored.boxes.admin!.noindex = true;
  });
  const meta = pageMetadata(landingPage, page, { mediaUrl: (media) => `https://cdn.test/${media.path}` });
  assert.equal(meta.openGraph.images?.[0]?.url, 'https://cdn.test/og/about.jpg');
  assert.deepEqual(meta.robots, { index: false, follow: false });

  const hidden = pageMetadata(landingPage, load((stored) => void (stored.boxes.admin!.hidden = true)));
  assert.deepEqual(hidden.robots, { index: false, follow: false });
});

test('JSON-LD is escaped so content cannot close the script tag', () => {
  const page = load((stored) => void (stored.title = '</script><script>alert(1)</script>'));
  const json = jsonLdString(landingPage, page)!;
  assert.doesNotMatch(json, /<\/script>/);
  assert.equal(JSON.parse(json).headline, '</script><script>alert(1)</script>');
});
