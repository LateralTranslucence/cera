/**
 * HTML helpers for the rich-text editor. They run in the browser (and in
 * tests under a DOM), using `document` to parse.
 *
 * The editor rewrites HTML into its own schema, which can drop things it
 * doesn't model (tables, figures, spans) and changes harmless details (mark
 * order, <b> vs <strong>). `sameContent` tells the two apart, so the editor
 * can open text it would change as HTML instead of silently rewriting it.
 */

const INLINE_ATOMS = new Set(['br', 'img']);
const MARKS = new Set(['a', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'strike', 'code', 'sub', 'sup', 'span', 'mark', 'small', 'abbr', 'cite', 'q', 'kbd', 'time']);
const SYNONYMS: Record<string, string> = { b: 'strong', i: 'em', del: 's', strike: 's' };
/** Cells and list items whose only child is a paragraph: the editor adds that paragraph. */
const UNWRAP = new Set(['li', 'td', 'th']);
/** For comparing only: a blockquote's single paragraph shows the same as its bare text. */
const UNWRAP_TO_COMPARE = new Set([...UNWRAP, 'blockquote']);

function parse(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}

const isElement = (node: Node): node is Element => node.nodeType === 1;
const isText = (node: Node) => node.nodeType === 3;
const tagOf = (element: Element) => element.tagName.toLowerCase();
const isInline = (node: Node) => isText(node) || (isElement(node) && (MARKS.has(tagOf(node)) || INLINE_ATOMS.has(tagOf(node))));
const isBlank = (node: Node) => isText(node) && !/\S/.test(node.nodeValue ?? '');

function attributeKey(element: Element): string {
  return [...element.attributes]
    .map((attribute) => `${attribute.name}=${attribute.value.trim()}`)
    .sort()
    .join(' ');
}

/* ------------------------------------------------------------------ */
/* Tidying what the editor writes                                      */
/* ------------------------------------------------------------------ */

/**
 * The editor's HTML as Cera stores it: list items and cells whose only
 * content is one paragraph lose that paragraph (as WordPress writes them),
 * trailing empty paragraphs go, and an empty document is ''.
 */
export function tidyEditorHtml(html: string): string {
  const root = parse(html);
  for (const element of root.querySelectorAll([...UNWRAP].join(','))) {
    const children = [...element.childNodes].filter((node) => !isBlank(node));
    const only = children[0];
    if (children.length === 1 && only && isElement(only) && tagOf(only) === 'p' && only.attributes.length === 0) {
      only.replaceWith(...only.childNodes);
    }
  }
  let last = root.lastChild;
  while (last && ((isElement(last) && tagOf(last) === 'p' && !last.textContent?.trim() && !last.querySelector('img')) || isBlank(last))) {
    last.remove();
    last = root.lastChild;
  }
  const container = document.createElement('div');
  container.append(root);
  return container.innerHTML;
}

/* ------------------------------------------------------------------ */
/* Comparing content                                                   */
/* ------------------------------------------------------------------ */

type Inline = { text: string; marks: string } | { atom: string };
type Block = { tag: string; attributes: string; blocks?: Block[]; inline?: Inline[] };

function inlineOf(nodes: Iterable<Node>, marks: string[] = [], out: Inline[] = []): Inline[] {
  for (const node of nodes) {
    if (isText(node)) {
      out.push({ text: node.nodeValue ?? '', marks: [...marks].sort().join('|') });
    } else if (isElement(node)) {
      const tag = tagOf(node);
      if (INLINE_ATOMS.has(tag)) out.push({ atom: `${tag} ${attributeKey(node)}` });
      else inlineOf(node.childNodes, [...marks, `${SYNONYMS[tag] ?? tag} ${attributeKey(node)}`], out);
    }
  }
  return out;
}

/** Merges runs with the same marks, collapses whitespace, trims the ends, and drops a trailing <br> (browsers ignore it). */
function normalizeInline(items: Inline[]): Inline[] {
  const merged: Inline[] = [];
  for (const item of items) {
    const previous = merged[merged.length - 1];
    if ('text' in item && previous && 'text' in previous && previous.marks === item.marks) previous.text += item.text;
    else merged.push({ ...item });
  }
  for (const item of merged) if ('text' in item) item.text = item.text.replace(/\s+/g, ' ');
  const first = merged[0];
  if (first && 'text' in first) first.text = first.text.trimStart();
  const last = merged[merged.length - 1];
  if (last && 'text' in last) last.text = last.text.trimEnd();
  const out = merged.filter((item) => !('text' in item) || item.text !== '');
  const end = out[out.length - 1];
  if (end && 'atom' in end && end.atom.startsWith('br ')) out.pop();
  return out;
}

function blocksOf(nodes: Iterable<Node>): Block[] {
  const blocks: Block[] = [];
  let run: Node[] = [];
  const flush = () => {
    const inline = normalizeInline(inlineOf(run));
    if (inline.length) blocks.push({ tag: 'p', attributes: '', inline });
    run = [];
  };
  for (const node of nodes) {
    if (isInline(node)) run.push(node);
    else if (isElement(node)) {
      flush();
      blocks.push(blockOf(node));
    }
  }
  flush();
  // Trailing empty paragraphs don't show.
  while (blocks.length) {
    const last = blocks[blocks.length - 1]!;
    if (last.tag === 'p' && !last.blocks && !last.inline?.length) blocks.pop();
    else break;
  }
  return blocks;
}

function blockOf(element: Element): Block {
  const tag = tagOf(element);
  const attributes = attributeKey(element);
  const hasBlocks = [...element.childNodes].some((child) => isElement(child) && !isInline(child));
  if (!hasBlocks) return { tag, attributes, inline: normalizeInline(inlineOf(element.childNodes)) };
  const blocks = blocksOf(element.childNodes);
  const only = blocks[0];
  if (UNWRAP_TO_COMPARE.has(tag) && blocks.length === 1 && only?.tag === 'p' && only.attributes === '' && only.inline) return { tag, attributes, inline: only.inline };
  return { tag, attributes, blocks };
}

/** A comparable form of some HTML: what it shows, not how it's spelled. */
export function contentKey(html: string): string {
  return JSON.stringify(blocksOf(parse(html).childNodes));
}

/** Whether two pieces of HTML show the same content (same text, formatting, links and attributes). */
export function sameContent(first: string, second: string): boolean {
  return contentKey(first) === contentKey(second);
}
