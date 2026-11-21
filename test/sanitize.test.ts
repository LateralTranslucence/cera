import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRichText, sanitizeRichTextWithReport } from '../src/sanitize.ts';
import { preparePageForSave, type StoredPage } from '../src/index.ts';
import { landingPage } from '../examples/next-site/cera/content-types/landing-page.ts';
import sample from '../examples/sample-page.json' with { type: 'json' };

/* ---------------------------- the allowlists ---------------------------- */

test('scripts, event handlers and inline styles never survive', () => {
  for (const toolbar of ['full', 'limited'] as const) {
    assert.equal(sanitizeRichText('<p onclick="steal()" style="color:red">a<script>alert(1)</script>b</p>', toolbar), '<p>ab</p>');
    assert.equal(sanitizeRichText('<iframe src="https://evil.test"></iframe><style>p{}</style>ok', toolbar), 'ok');
  }
});

test('links: safe schemes and relative paths stay; javascript:, data: and protocol-relative go; new tabs get rel', () => {
  assert.equal(sanitizeRichText('<a href="about">a</a> <a href="/contact#form">b</a> <a href="mailto:hi@example.test">c</a>'),
    '<a href="about">a</a> <a href="/contact#form">b</a> <a href="mailto:hi@example.test">c</a>');
  assert.equal(sanitizeRichText('<a href="javascript:alert(1)">x</a><a href="//evil.test">y</a><a href="data:text/html,hi">z</a>'), '<a>x</a><a>y</a><a>z</a>');
  assert.equal(sanitizeRichText('<a href="https://ok.test" target="_blank">x</a>'), '<a href="https://ok.test" target="_blank" rel="noopener noreferrer">x</a>');
  assert.equal(sanitizeRichText('<a href="https://ok.test" target="_top" rel="opener">x</a>'), '<a href="https://ok.test" rel="opener">x</a>');
});

test('full toolbar keeps headings, images over http(s), tables and classes', () => {
  const html = '<h2 class="lead">T</h2><img src="https://cdn.test/a.png" alt="A" onerror="x()"><table><tr><td colspan="2">c</td></tr></table>';
  assert.equal(sanitizeRichText(html, 'full'), '<h2 class="lead">T</h2><img src="https://cdn.test/a.png" alt="A" /><table><tr><td colspan="2">c</td></tr></table>');
  assert.equal(sanitizeRichText('<img src="data:image/png;base64,AAAA">', 'full'), '<img />');
});

test('limited toolbar keeps simple formatting and drops the rest, keeping its text', () => {
  const html = '<h2 class="x">Title</h2><p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s></p><ul><li>one</li></ul><blockquote>q</blockquote><img src="https://cdn.test/a.png">';
  assert.equal(sanitizeRichText(html, 'limited'), 'Title<p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s></p><ul><li>one</li></ul><blockquote>q</blockquote>');
});

test('the report flags real removals, not harmless reformatting', () => {
  assert.equal(sanitizeRichTextWithReport('<p>Hi &amp; <em>bye</em></p>').removed, false);
  assert.equal(sanitizeRichTextWithReport('<p>unclosed <em>em').removed, false); // repaired, nothing removed
  assert.equal(sanitizeRichTextWithReport('<p>x<script>1</script></p>').removed, true);
  assert.equal(sanitizeRichTextWithReport('<a href="javascript:x()">x</a>').removed, true);
  assert.equal(sanitizeRichTextWithReport('<h2>t</h2>', 'limited').removed, true);
});

/* ---------------------------- on save ---------------------------- */

const clone = (): StoredPage => structuredClone(sample) as unknown as StoredPage;

test('saving sanitizes boxes and panels, including repeater items, and warns where it removed something', async () => {
  const raw = clone();
  raw.boxes.hero!.copy = '<p>Hello<script>alert(1)</script></p>';
  const items = raw.panels[0]!.data.blocks as Array<Record<string, unknown>>;
  items[0]!.copy = '<h2>Big</h2><p><strong>ok</strong></p>'; // block copy uses the limited toolbar
  raw.panels[0]!.data.copy = '<p>Fine <a href="about">link</a></p>';

  const result = await preparePageForSave(landingPage, raw, { mode: 'publish' });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.page!.boxes.hero!.copy, '<p>Hello</p>');
  assert.equal((result.page!.panels[0]!.data.blocks as Array<Record<string, unknown>>)[0]!.copy, 'Big<p><strong>ok</strong></p>');
  assert.equal(result.page!.panels[0]!.data.copy, '<p>Fine <a href="about">link</a></p>');
  assert.deepEqual(
    result.issues.map((issue) => [issue.code, issue.severity, issue.path.join('.')]),
    [
      ['html-sanitized', 'warning', 'boxes.hero.copy'],
      ['html-sanitized', 'warning', 'panels.0.data.blocks.0.copy'],
    ],
  );
});

test('panels of unknown types are kept exactly, unsanitized (they are never rendered)', async () => {
  const raw = clone();
  const unknown = { id: 'u', type: 'carousel', v: 1, data: { copy: '<script>x</script>' } };
  raw.panels.push(unknown);
  const result = await preparePageForSave(landingPage, raw, { mode: 'draft' });
  assert.deepEqual(result.page!.panels.at(-1), unknown);
});

test('sanitize warnings do not stop beforeSave, and the warnings survive the second pass', async () => {
  const raw = clone();
  raw.slug = 'home'; // landing page hook sets the title to "Home"
  raw.boxes.hero!.copy = '<p onclick="x()">Hi</p>';
  const result = await preparePageForSave(landingPage, raw, { mode: 'publish' });
  assert.equal(result.ok, true);
  assert.equal(result.page!.title, 'Home');
  assert.equal(result.page!.boxes.hero!.copy, '<p>Hi</p>');
  assert.deepEqual(result.issues.map((issue) => issue.path.join('.')), ['boxes.hero.copy']);
});
