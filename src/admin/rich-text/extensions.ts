/**
 * The rich-text editor's schema, per toolbar. It mirrors the sanitizer's
 * allowlists (../../sanitize.ts) so the editor can only produce what a save
 * keeps:
 *
 *   limited  paragraphs, line breaks, bold, italic, underline, strikethrough,
 *            links, lists, blockquotes
 *   full     all of that, plus headings 2–6, code, code blocks, horizontal
 *            rules, subscript, superscript, images, and `class` attributes
 *            (WordPress content relies on them: alignleft, wp-image-12)
 *
 * Tables and figures aren't in the schema; text that has them opens as HTML
 * (see html.ts).
 */
import { Extension, type Extensions } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import StarterKit from '@tiptap/starter-kit';
import type { HtmlToolbar } from '../../sanitize.ts';

/** Keeps `class` on every node and mark that can carry one. */
const ClassAttribute = Extension.create({
  name: 'ceraClassAttribute',
  addGlobalAttributes() {
    return [
      {
        types: [
          'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'codeBlock', 'horizontalRule', 'image',
          'bold', 'italic', 'underline', 'strike', 'code', 'subscript', 'superscript',
        ],
        attributes: {
          class: {
            default: null,
            parseHTML: (element) => element.getAttribute('class') || null,
            renderHTML: (attributes) => (attributes.class ? { class: attributes.class } : {}),
          },
        },
      },
    ];
  },
});

/** Images sit inside paragraphs, as in WordPress content, and keep `loading`. */
const InlineImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      loading: { default: null },
    };
  },
}).configure({ inline: true, allowBase64: false });

export function richTextExtensions(toolbar: HtmlToolbar): Extensions {
  const full = toolbar === 'full';
  return [
    StarterKit.configure({
      // The editor never adds a trailing paragraph of its own: stored HTML stays as written.
      trailingNode: false,
      // Links keep whatever target and rel they had; the toolbar sets them explicitly.
      link: { openOnClick: false, autolink: true, HTMLAttributes: { target: null, rel: null, class: null } },
      ...(full
        ? { heading: { levels: [2, 3, 4, 5, 6] } }
        : { heading: false, code: false, codeBlock: false, horizontalRule: false }),
    }),
    ...(full ? [Subscript, Superscript, InlineImage, ClassAttribute] : []),
  ];
}
