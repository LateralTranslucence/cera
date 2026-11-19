/**
 * Rich-text sanitizing for `f.html()` fields. Runs on save (see
 * `preparePageForSave`), so stored HTML is always safe to render.
 *
 * The allowlists follow the Developers Only theme: its `wp_editor` field was
 * filtered by WordPress's `wp_kses_post`, and `wp_editor_limited` used the
 * "teeny" toolbar (bold, italic, underline, strikethrough, blockquote, lists,
 * links). Inline `style` attributes are never kept.
 *
 * Imported lazily by document.ts, so the sanitizer library stays out of
 * client bundles that only need field definitions.
 */
import sanitizeHtml, { type IOptions } from 'sanitize-html';

export type HtmlToolbar = 'full' | 'limited';

const LIMITED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'a', 'ul', 'ol', 'li', 'blockquote'];

const FULL_TAGS = [
  ...LIMITED_TAGS,
  'h2', 'h3', 'h4', 'h5', 'h6',
  'code', 'pre', 'hr', 'sub', 'sup', 'span',
  'img', 'figure', 'figcaption',
  'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
];

/** Links open in the same tab or a new one; anything else is dropped. New tabs get rel="noopener noreferrer". */
function safeLink(tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  const out = { ...attribs };
  if (out.target === '_blank') out.rel = 'noopener noreferrer';
  else delete out.target;
  return { tagName, attribs: out };
}

function optionsFor(toolbar: HtmlToolbar): IOptions {
  const full = toolbar === 'full';
  return {
    allowedTags: full ? FULL_TAGS : LIMITED_TAGS,
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'title'],
      ...(full && {
        img: ['src', 'alt', 'width', 'height', 'loading'],
        th: ['colspan', 'rowspan', 'scope'],
        td: ['colspan', 'rowspan'],
        // Class names can't run code, and content pasted from WordPress relies on them (alignleft, wp-image-12).
        '*': ['class'],
      }),
    },
    // Relative links ("about", "/contact", "#top") have no scheme and are allowed.
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'] },
    allowProtocolRelative: false,
    // Disallowed tags are removed but their text is kept; script/style contents go entirely.
    disallowedTagsMode: 'discard',
    transformTags: { a: safeLink },
  };
}

/** Everything allowed, same link handling: used only to tell whether sanitizing removed anything. */
const NORMALIZE: IOptions = {
  allowedTags: false,
  allowedAttributes: false,
  allowVulnerableTags: true,
  // Includes the dangerous schemes so that stripping them counts as a removal.
  allowedSchemes: ['http', 'https', 'mailto', 'tel', 'javascript', 'vbscript', 'data', 'file', 'ftp', 'sms'],
  allowProtocolRelative: true,
  transformTags: { a: safeLink },
};

export function sanitizeRichText(html: string, toolbar: HtmlToolbar = 'full'): string {
  return sanitizeHtml(html, optionsFor(toolbar));
}

/**
 * Sanitizes and reports whether anything the editor wrote was removed
 * (compared with the same HTML parsed without an allowlist, so harmless
 * reformatting doesn't count).
 */
export function sanitizeRichTextWithReport(html: string, toolbar: HtmlToolbar = 'full'): { html: string; removed: boolean } {
  const clean = sanitizeRichText(html, toolbar);
  return { html: clean, removed: clean !== sanitizeHtml(html, NORMALIZE) };
}
