// The rich-text editor's schema and HTML helpers, run through a real Tiptap
// editor under happy-dom: what the editor keeps exactly, what it only
// respells, and what it would lose (which the admin opens as HTML instead).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import type { Editor as EditorType } from '@tiptap/core';
import type { HtmlToolbar } from '../src/sanitize.ts';

const window = new Window();
let Editor: typeof EditorType;
let richTextExtensions: typeof import('../src/admin/rich-text/extensions.ts').richTextExtensions;
let html: typeof import('../src/admin/rich-text/html.ts');

const GLOBALS = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'Text', 'DocumentFragment', 'DOMParser', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];

before(async () => {
  const globalScope = globalThis as Record<string, unknown>;
  for (const key of GLOBALS) {
    const value = key === 'window' ? window : (window as unknown as Record<string, unknown>)[key];
    Object.defineProperty(globalScope, key, { value: typeof value === 'function' && /^[a-z]/.test(key) ? value.bind(window) : value, configurable: true, writable: true });
  }
  ({ Editor } = await import('@tiptap/core'));
  ({ richTextExtensions } = await import('../src/admin/rich-text/extensions.ts'));
  html = await import('../src/admin/rich-text/html.ts');
});

after(async () => {
  await window.happyDOM.close();
});

/** Loads `input` into an editor and returns what it would write, tidied as the admin stores it. */
function roundTrip(input: string, toolbar: HtmlToolbar = 'full'): string {
  const editor = new Editor({ extensions: richTextExtensions(toolbar), content: input });
  const out = html.tidyEditorHtml(editor.getHTML());
  editor.destroy();
  return out;
}

test('ordinary content comes back exactly as written', () => {
  for (const input of [
    '<p>Hello <strong>world</strong> and <a href="/about">about us</a>.</p><ul><li>One</li><li>Two</li></ul>',
    '<p>Line one<br>line two</p><blockquote><p>Quoted</p></blockquote><ol><li>First</li></ol>',
    '<p><em>Italic</em>, <u>underlined</u>, <s>struck</s></p>',
  ]) {
    assert.equal(roundTrip(input), input);
    assert.equal(roundTrip(input, 'limited'), input);
  }
  assert.equal(roundTrip('<h2>Title</h2><p>Text</p><hr><pre><code>x = 1</code></pre>'), '<h2>Title</h2><p>Text</p><hr><pre><code>x = 1</code></pre>');
});

test('respellings count as the same content', () => {
  for (const input of [
    '<p><b><i>x</i></b> <a href="https://example.com" target="_blank" rel="noopener noreferrer"><strong>y</strong></a></p>',
    'Plain text with no tags',
    '<p>Trailing break<br></p>\n\n<p>  spaced   out  </p>',
    '<blockquote>Bare quote</blockquote>',
    '<ul>\n  <li><p>Wrapped</p></li>\n</ul>',
    '<p>x</p><p></p><p></p>',
  ]) {
    const out = roundTrip(input);
    assert.ok(html.sameContent(input, out), `${input}\n→ ${out}`);
  }
});

test('WordPress classes, images and sub/superscripts survive the full toolbar', () => {
  const input =
    '<p class="has-text-align-center">Mars <sup>1</sup> H<sub>2</sub>O</p>' +
    '<p><img src="https://x.supabase.co/storage/v1/object/public/cera-media/2026/11/a1b2c3d4-mars.jpg" alt="Mars" width="800" height="600" class="alignleft wp-image-12" loading="lazy">Caption text</p>' +
    '<h3 class="wp-block-heading">Moons</h3>';
  const out = roundTrip(input);
  assert.ok(html.sameContent(input, out), out);
  assert.match(out, /<img [^>]*class="alignleft wp-image-12"/);
  assert.match(out, /width="800"/);
});

test('content the editor would change is detected', () => {
  for (const [input, toolbar] of [
    ['<table><tbody><tr><td>Cell</td></tr></tbody></table>', 'full'],
    ['<figure><img src="https://e.com/a.png" alt=""><figcaption>Caption</figcaption></figure>', 'full'],
    ['<p>A <span class="highlight">highlighted</span> word</p>', 'full'],
    ['<h2>Heading</h2>', 'limited'],
    ['<p><img src="https://e.com/a.png" alt="A"></p>', 'limited'],
    ['<p class="intro">Classed</p>', 'limited'],
  ] as const) {
    const out = roundTrip(input, toolbar);
    assert.equal(html.sameContent(input, out), false, `${toolbar}: ${input}\n→ ${out}`);
  }
});

test('the editor only writes what the sanitizer keeps: no added target, rel or trailing paragraph', () => {
  assert.equal(roundTrip('<p><a href="https://example.com">x</a></p>'), '<p><a href="https://example.com">x</a></p>');
  assert.equal(roundTrip('<h2>Last</h2>'), '<h2>Last</h2>');
  assert.equal(roundTrip(''), '');
  assert.equal(roundTrip('<p></p>'), '');
  assert.equal(html.tidyEditorHtml('<ul><li><p>a</p></li><li><p class="x">b</p></li></ul>'), '<ul><li>a</li><li><p class="x">b</p></li></ul>');
});

test('contentKey compares what shows, not how it is spelled', () => {
  assert.equal(html.sameContent('<p>a <b>b</b></p>', '<p>a <strong>b</strong></p>'), true);
  assert.equal(html.sameContent('<p>a</p>', '<p>b</p>'), false);
  assert.equal(html.sameContent('<p><a href="/x">a</a></p>', '<p><a href="/y">a</a></p>'), false);
  assert.equal(html.sameContent('<p><a href="/x" target="_blank">a</a></p>', '<p><a href="/x">a</a></p>'), false);
  assert.equal(html.sameContent('<ol><li>a</li></ol>', '<ul><li>a</li></ul>'), false);
});
