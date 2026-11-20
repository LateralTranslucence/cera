// The core panels render through <Panels>: the shared frame, then each panel's own markup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { readPage, type StoredPage } from '../src/index.ts';
import { Panels } from '../src/next/index.ts';
import { corePanels } from '../src/panels/index.ts';
import { landingPage } from '../examples/next-site/cera/content-types/landing-page.ts';

function pageWith(panels: StoredPage['panels']): StoredPage {
  return { id: '00000000-0000-4000-8000-000000000001', contentType: 'landing_page', slug: 'gallery', title: 'Gallery', boxes: {}, panels };
}

async function render(type: string, data: Record<string, unknown>): Promise<string> {
  const { page, issues } = readPage(landingPage, pageWith([{ id: 'p', type, v: 1, data }]));
  assert.deepEqual(issues, [], JSON.stringify(issues));
  return renderToStaticMarkup(await Panels({ contentType: landingPage, page: page! }));
}

const image = { id: 'm1', path: '2026/11/abc-mars.png', kind: 'image', alt: 'Mars', width: 800, height: 500 };

test('every core panel is in the landing page, under cera/', () => {
  assert.deepEqual(
    landingPage.panels.map((p) => p.type),
    corePanels.map((p) => p.type),
  );
  for (const p of corePanels) assert.match(p.type, /^cera\/[a-z-]+$/);
});

test('the frame: anchor id, title, copy, and the background as color, image and overlay', async () => {
  const html = await render('cera/text', {
    title: 'Hello',
    copy: '<p>World</p>',
    anchorId: 'hello',
    background: { color: '#112233', media: image, overlay: true },
  });
  assert.match(html, /<section id="hello" class="panel panel--text has-background has-overlay" style="background-color:#112233;--background-image:url\(&quot;[^"]*2026\/11\/abc-mars\.png&quot;\)" data-index="0">/);
  assert.match(html, /<header class="panel__header"><h2>Hello<\/h2><\/header>/);
  assert.match(html, /<div class="rich-text panel__copy"><p>World<\/p><\/div>/);
});

test('a video background plays behind the panel', async () => {
  const html = await render('cera/cta', { background: { media: { ...image, kind: 'video', path: '2026/11/clip.mp4' }, overlay: false } });
  assert.match(html, /class="panel panel--cta has-background has-video"/);
  assert.match(html, /<video class="panel__video" src="[^"]*clip\.mp4" autoPlay="" muted="" loop="" playsInline="" aria-hidden="true">/);
  assert.doesNotMatch(html, /--background-image/);
});

test('text and cta: copy and buttons; text can sit over the background', async () => {
  const text = await render('cera/text', { title: 'T', overlay: true, ctas: [{ text: 'Go', url: '/go' }] });
  assert.match(text, /class="panel panel--text is-overlay"/);
  assert.match(text, /<p class="ctas"><a class="cta" href="\/go">Go<\/a><\/p>/);
  const cta = await render('cera/cta', { title: 'Ready?', ctas: [{ text: 'A', url: 'a' }, { text: 'B', url: 'https://b.test', target: '_blank' }] });
  assert.match(cta, /href="\/a">A<\/a><a class="cta" href="https:\/\/b\.test" target="_blank" rel="noopener noreferrer">B</);
});

test('quotes: empty quotes are skipped; two or more become a slider', async () => {
  const one = await render('cera/quotes', { quotes: [{ _id: 'a', quote: '<p>Ad astra.</p>', attribution: 'Seneca' }, { _id: 'b', attribution: 'No quote' }] });
  assert.match(one, /<ul class="quotes"><li class="quote"><blockquote><div class="rich-text"><p>Ad astra\.<\/p><\/div><\/blockquote><p class="quote__attribution">Seneca<\/p><\/li><\/ul>/);
  const two = await render('cera/quotes', { quotes: [{ _id: 'a', quote: '<p>1</p>' }, { _id: 'b', quote: '<p>2</p>' }] });
  assert.match(two, /<ul class="quotes quotes--slider">/);
  assert.doesNotMatch(await render('cera/quotes', {}), /<ul/);
});

test('featured media: image with size and link; video with controls; full width', async () => {
  const img = await render('cera/featured-media', { media: image, imageLink: 'https://mars.test', fullWidth: true });
  assert.match(img, /class="panel panel--featured-media is-full-width"/);
  assert.match(img, /<figure class="featured-media"><a href="https:\/\/mars\.test"><img src="[^"]*abc-mars\.png" alt="Mars" width="800" height="500" loading="lazy"\/><\/a><\/figure>/);
  const vid = await render('cera/featured-media', { media: { ...image, kind: 'video' }, imageLink: 'https://ignored.test' });
  assert.match(vid, /<figure class="featured-media"><video [^>]*controls=""/);
  assert.doesNotMatch(vid, /ignored\.test/);
});

test('tabs: accessible markup, every tab in the HTML, the first one open, ids from labels', async () => {
  const html = await render('cera/tabs', {
    tabs: [
      { _id: 'a', navLabel: 'Our Team', title: 'People', copy: '<p>Hi</p>', media: image },
      { _id: 'b', navLabel: 'Our Team', copy: '<p>Same label</p>' },
      { _id: 'c', title: 'No label, skipped' },
    ],
  });
  assert.match(html, /<div role="tablist" class="tabs__nav" aria-orientation="horizontal">/);
  assert.match(html, /<button type="button" role="tab" id="p0-tab-our-team" aria-selected="true" aria-controls="p0-panel-our-team" tabindex="0" class="tabs__tab">Our Team<\/button>/);
  assert.match(html, /id="p0-tab-our-team-2" aria-selected="false" aria-controls="p0-panel-our-team-2" tabindex="-1"/);
  assert.match(html, /<div id="p0-panel-our-team" role="tabpanel" aria-labelledby="p0-tab-our-team" tabindex="0" class="tabs__panel"><span id="our-team" class="tabs__anchor"><\/span><img class="tabs__media"/);
  assert.match(html, /<div id="p0-panel-our-team-2" role="tabpanel" [^>]*hidden=""[^>]*>.*Same label/);
  assert.doesNotMatch(html, /No label/);
});

test('decision tree: at most two cards, details hidden until opened, links need a title and URL', async () => {
  const card = (id: string, title: string) => ({
    _id: id,
    title,
    overview: '<p>Overview</p>',
    copy: '<p>Details</p>',
    cta: { text: 'Start', url: '/start' },
    list: [
      { _id: `${id}1`, title: 'Rovers', url: '/rovers', icon: image },
      { _id: `${id}2`, title: 'No URL' },
    ],
  });
  const html = await render('cera/decision-tree', { cards: [card('a', 'Orbit'), card('b', 'Land')] });
  assert.equal(html.match(/class="decision-tree__card"/g)?.length, 2);
  assert.match(html, /<div id="[^"]+" class="decision-tree__detail" hidden=""><div class="rich-text"><p>Details<\/p><\/div>/);
  assert.match(html, /<li><a href="\/rovers"><img src="[^"]*abc-mars\.png" alt="" width="800" height="500" loading="lazy"\/><span>Rovers<\/span><\/a><\/li>/);
  assert.doesNotMatch(html, /No URL/);
  assert.match(html, /aria-expanded="false">Expand<span class="visually-hidden">: Orbit<\/span>/);
  // The field itself refuses a third card.
  const { issues } = readPage(landingPage, pageWith([{ id: 'p', type: 'cera/decision-tree', v: 1, data: { cards: [card('a', '1'), card('b', '2'), card('c', '3')] } }]));
  assert.ok(issues.some((i) => i.path.includes('cards')), JSON.stringify(issues));
});

test('accordion: items without a title are skipped; all closed, text in the HTML, headers are buttons', async () => {
  const html = await render('cera/accordion', {
    fullWidth: true,
    items: [
      { _id: 'a', title: 'What is Cera?', text: '<p>A panel CMS.</p>' },
      { _id: 'b', text: '<p>No title</p>' },
      { _id: 'c', title: 'Title only' },
    ],
  });
  assert.match(html, /class="panel panel--accordion is-full-width"/);
  assert.equal(html.match(/class="accordion__item"/g)?.length, 2);
  assert.match(html, /<h3 class="accordion__header"><button type="button" id="[^"]+" class="accordion__trigger" aria-expanded="false" aria-controls="[^"]+"><span>What is Cera\?<\/span>/);
  assert.match(html, /role="region" aria-labelledby="[^"]+" class="accordion__panel" hidden=""><div class="rich-text"><p>A panel CMS\.<\/p>/);
  assert.doesNotMatch(html, /No title/);
});

test('stats: the HTML has each final number, formatted, with screen readers reading the final value', async () => {
  const html = await render('cera/stats', {
    stats: [
      { _id: 'a', before: '$', number: 1250000, after: '+', description: 'Raised' },
      { _id: 'b', number: 4.46, decimal: true, description: 'Rating' },
      { _id: 'c', number: 10, countDown: true, description: 'Days left' },
      { _id: 'd', description: 'Nothing to show' },
    ],
  });
  assert.match(html, /<span class="stats__before">\$<\/span><span class="stats__number" aria-label="1,250,000"><span aria-hidden="true">1,250,000<\/span><\/span><span class="stats__after">\+<\/span>/);
  assert.match(html, /aria-label="4\.5"><span aria-hidden="true">4\.5</);
  // Counting down ends at zero.
  assert.match(html, /aria-label="0"><span aria-hidden="true">0</);
  assert.doesNotMatch(html, /Nothing to show/);
});

test('gallery: images only, each a button that opens it; the dialog is closed until then', async () => {
  const html = await render('cera/gallery', {
    gallery: [image, { ...image, id: 'v', kind: 'video', path: 'clip.mp4' }, { ...image, id: 'm2', alt: undefined }],
  });
  assert.equal(html.match(/class="gallery__open"/g)?.length, 2);
  assert.match(html, /<button type="button" class="gallery__open"><img src="[^"]*abc-mars\.png" alt="" width="800" height="500" loading="lazy"\/><span class="visually-hidden">Open: Mars<\/span><\/button>/);
  assert.match(html, /<span class="visually-hidden">Open image 2<\/span>/);
  assert.doesNotMatch(html, /clip\.mp4/);
  assert.match(html, /<dialog class="gallery__dialog" aria-label="Image">/);
});

test('light backgrounds: dark text when black beats white for contrast', async () => {
  const { isLightColor } = await import('../src/color.ts');
  assert.equal(isLightColor('#FFB400'), true); // the theme's yellow
  assert.equal(isLightColor('#fff'), true);
  assert.equal(isLightColor('#1d2a3a'), false);
  assert.equal(isLightColor('#5b3412'), false);
  assert.equal(isLightColor('#777777'), true); // mid gray: black text has the edge
  assert.equal(isLightColor('yellow'), undefined); // named colors: unknown, keep the default
  assert.equal(isLightColor(undefined), undefined);

  assert.match(await render('cera/cta', { background: { color: '#FFB400', overlay: false } }), /class="panel panel--cta has-background has-light-background"/);
  // An overlay, an image or a dark color keeps light text.
  assert.doesNotMatch(await render('cera/cta', { background: { color: '#FFB400', overlay: true } }), /has-light-background/);
  assert.doesNotMatch(await render('cera/cta', { background: { color: '#FFB400', media: image, overlay: false } }), /has-light-background/);
  assert.doesNotMatch(await render('cera/cta', { background: { color: '#1d2a3a', overlay: false } }), /has-light-background/);
  assert.doesNotMatch(await render('cera/cta', { background: { color: 'yellow', overlay: false } }), /has-light-background/);
});
