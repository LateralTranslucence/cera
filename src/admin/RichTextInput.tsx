'use client';
/**
 * The control for `f.html()` fields: a visual editor (Tiptap) with a
 * toolbar matching the field's `toolbar` option, and an HTML view.
 *
 * Stored HTML is never rewritten just by opening it. Text the visual editor
 * can't show exactly (tables, figures, spans; see rich-text/html.ts) opens in
 * the HTML view with a note; switching to the visual view is allowed, and
 * the text only changes once the editor edits it there.
 *
 * Whatever it writes is sanitized again on save (decision 18).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import type { HtmlToolbar } from '../sanitize.ts';
import { mediaUrl } from '../media-url.ts';
import { MediaLibrary, type MediaContext } from './media.tsx';
import { richTextExtensions } from './rich-text/extensions.ts';
import { sameContent, tidyEditorHtml } from './rich-text/html.ts';

type Mode = 'visual' | 'html';
type Panel = 'link' | 'image' | null;

export function RichTextInput({
  id,
  value,
  onChange,
  readOnly,
  toolbar = 'full',
  media,
  labelledBy,
}: {
  id: string;
  value: unknown;
  onChange: (value: string | undefined) => void;
  readOnly: boolean;
  toolbar?: HtmlToolbar;
  media?: MediaContext;
  labelledBy?: string;
}) {
  const html = typeof value === 'string' ? value : '';
  const [mode, setMode] = useState<Mode>('visual');
  // The visual editor would change this text if it were edited there.
  const [lossy, setLossy] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  // The last HTML this control wrote, so its own changes don't reload the editor.
  const written = useRef<string | null>(null);

  const editor = useEditor({
    extensions: richTextExtensions(toolbar),
    content: html,
    editable: !readOnly,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        id,
        class: 'cera-rich__content',
        role: 'textbox',
        'aria-multiline': 'true',
        ...(labelledBy && { 'aria-labelledby': labelledBy }),
      },
    },
    onUpdate: ({ editor }) => {
      const next = tidyEditorHtml(editor.getHTML());
      written.current = next;
      setLossy(false);
      onChange(next === '' ? undefined : next);
    },
  });

  // Check new outside values (first load, a save that returned sanitized HTML, a reset).
  useEffect(() => {
    if (!editor || html === written.current) return;
    written.current = html;
    editor.commands.setContent(html, { emitUpdate: false });
    const keeps = sameContent(html, tidyEditorHtml(editor.getHTML()));
    setLossy(!keeps);
    if (!keeps) setMode('html');
  }, [editor, html]);

  useEffect(() => {
    // false: changing editability isn't an edit (by default Tiptap reports it as one).
    if (editor && editor.isEditable === readOnly) editor.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  function showVisual() {
    if (editor) {
      written.current = html;
      editor.commands.setContent(html, { emitUpdate: false });
      setLossy(!sameContent(html, tidyEditorHtml(editor.getHTML())));
    }
    setMode('visual');
  }

  return (
    <div className={`cera-rich${mode === 'html' ? ' cera-rich--html' : ''}`}>
      {!readOnly && (
        <div className="cera-rich__toolbar" role="toolbar" aria-label="Formatting" aria-controls={id}>
          {mode === 'visual' && editor && <Buttons editor={editor} toolbar={toolbar} panel={panel} setPanel={setPanel} canInsertImages={Boolean(media)} />}
          <span className="cera-rich__spacer" />
          <button
            type="button"
            className="cera-rich__button cera-rich__mode"
            aria-pressed={mode === 'html'}
            title={mode === 'html' ? 'Edit visually' : 'Edit the HTML'}
            onClick={() => (mode === 'html' ? showVisual() : (setMode('html'), setPanel(null)))}
          >
            HTML
          </button>
        </div>
      )}

      {lossy && (
        <p className="cera-rich__notice" role="note">
          {mode === 'html'
            ? 'This text has formatting the visual editor can’t show exactly, such as a table or a styled span, so it’s shown as HTML. You can still switch to the visual editor, but editing there simplifies that formatting.'
            : 'Editing here will simplify formatting the visual editor can’t show. Until you change something, the text stays as it is.'}
        </p>
      )}

      {mode === 'visual' && editor && panel === 'link' && <LinkPanel editor={editor} onClose={() => setPanel(null)} />}
      {mode === 'visual' && editor && panel === 'image' && media && <ImagePanel editor={editor} media={media} onClose={() => setPanel(null)} />}
      {mode === 'visual' && editor && toolbar === 'full' && !readOnly && editor.isActive('image') && <ImageAlt editor={editor} />}

      {mode === 'html' ? (
        <textarea
          id={id}
          className="cera-code cera-rich__source"
          rows={8}
          value={html}
          readOnly={readOnly}
          aria-labelledby={labelledBy}
          onChange={(e) => {
            written.current = null;
            onChange(e.target.value === '' ? undefined : e.target.value);
          }}
        />
      ) : (
        <EditorContent editor={editor} className="cera-rich__editor" />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbar                                                             */
/* ------------------------------------------------------------------ */

function Button({ label, title, active, disabled, onClick, children }: { label: string; title?: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="cera-rich__button"
      aria-label={label}
      title={title ?? label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      // Keep the selection in the editor.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const BLOCKS = [
  { value: 'p', label: 'Paragraph' },
  { value: '2', label: 'Heading 2' },
  { value: '3', label: 'Heading 3' },
  { value: '4', label: 'Heading 4' },
  { value: '5', label: 'Heading 5' },
  { value: '6', label: 'Heading 6' },
];

function Buttons({
  editor,
  toolbar,
  panel,
  setPanel,
  canInsertImages,
}: {
  editor: Editor;
  toolbar: HtmlToolbar;
  panel: Panel;
  setPanel: (p: Panel) => void;
  canInsertImages: boolean;
}) {
  const full = toolbar === 'full';
  const chain = () => editor.chain().focus();
  const level = ([2, 3, 4, 5, 6] as const).find((l) => editor.isActive('heading', { level: l }));
  const toggle = (p: Panel) => setPanel(panel === p ? null : p);

  return (
    <>
      {full && (
        <select
          className="cera-rich__block"
          aria-label="Text style"
          value={level ? String(level) : 'p'}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'p') chain().setParagraph().run();
            else chain().setHeading({ level: Number(v) as 2 | 3 | 4 | 5 | 6 }).run();
          }}
        >
          {BLOCKS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      )}
      <Button label="Bold" title="Bold (Ctrl+B)" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}>
        <b>B</b>
      </Button>
      <Button label="Italic" title="Italic (Ctrl+I)" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}>
        <i>I</i>
      </Button>
      <Button label="Underline" title="Underline (Ctrl+U)" active={editor.isActive('underline')} onClick={() => chain().toggleUnderline().run()}>
        <u>U</u>
      </Button>
      <Button label="Strikethrough" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()}>
        <s>S</s>
      </Button>
      <Button label="Link" active={editor.isActive('link') || panel === 'link'} onClick={() => toggle('link')}>
        Link
      </Button>
      <span className="cera-rich__divider" />
      <Button label="Bulleted list" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()}>
        • List
      </Button>
      <Button label="Numbered list" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()}>
        1. List
      </Button>
      <Button label="Quote" active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()}>
        Quote
      </Button>
      {full && (
        <>
          {canInsertImages && (
            <Button label="Image" active={panel === 'image'} onClick={() => toggle('image')}>
              Image
            </Button>
          )}
          <Button label="Horizontal line" onClick={() => chain().setHorizontalRule().run()}>
            Line
          </Button>
        </>
      )}
      <span className="cera-rich__divider" />
      <Button label="Undo" title="Undo (Ctrl+Z)" disabled={!editor.can().undo()} onClick={() => chain().undo().run()}>
        ↶
      </Button>
      <Button label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!editor.can().redo()} onClick={() => chain().redo().run()}>
        ↷
      </Button>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Links                                                               */
/* ------------------------------------------------------------------ */

function LinkPanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const current = editor.getAttributes('link') as { href?: string; target?: string };
  const [href, setHref] = useState(current.href ?? '');
  const [newTab, setNewTab] = useState(current.target === '_blank');
  const active = editor.isActive('link');

  function apply() {
    const url = href.trim();
    if (!url) return remove();
    const attrs = { href: url, target: newTab ? '_blank' : null, rel: newTab ? 'noopener noreferrer' : null };
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !active) {
      // Nothing selected: insert the address as the link text.
      chain.insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs }] }).run();
    } else {
      chain.extendMarkRange('link').setLink(attrs).run();
    }
    onClose();
  }

  function remove() {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    onClose();
  }

  return (
    <div className="cera-rich__panel" role="group" aria-label="Link">
      <label className="cera-inline cera-rich__grow">
        Address
        <input
          type="text"
          inputMode="url"
          value={href}
          autoFocus
          placeholder="/page, https://…, mailto:…"
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              apply();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
              editor.commands.focus();
            }
          }}
        />
      </label>
      <label className="cera-rich__check">
        <input type="checkbox" checked={newTab} onChange={(e) => setNewTab(e.target.checked)} /> Open in a new tab
      </label>
      <button type="button" className="cera-button cera-button--small cera-button--primary" onClick={apply}>
        {active ? 'Update link' : 'Add link'}
      </button>
      {active && (
        <button type="button" className="cera-button cera-button--small" onClick={remove}>
          Remove link
        </button>
      )}
      <button type="button" className="cera-link-button" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

function ImagePanel({ editor, media, onClose }: { editor: Editor; media: MediaContext; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function insert(item: { path: string; kind: 'image' | 'video' | 'embed'; alt?: string; width?: number; height?: number }) {
    editor
      .chain()
      .focus()
      .setImage({ src: mediaUrl(item), alt: item.alt ?? '', ...(item.width && { width: item.width }), ...(item.height && { height: item.height }) })
      .run();
    onClose();
  }

  async function upload(file: File) {
    setError(null);
    setBusy(`Uploading ${file.name}…`);
    try {
      const result = await media.upload(file);
      if (result.ok) insert(result.item);
      else setError(result.message);
    } catch {
      setError('The upload failed. Try again.');
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <div className="cera-rich__panel cera-rich__panel--image" role="group" aria-label="Insert an image">
      <div className="cera-media__actions">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          className="cera-visually-hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <button type="button" className="cera-button cera-button--small" disabled={Boolean(busy)} onClick={() => fileInput.current?.click()}>
          Upload an image
        </button>
        <span className="cera-note">or pick one from the library:</span>
        <span className="cera-rich__spacer" />
        <button type="button" className="cera-link-button" onClick={onClose}>
          Cancel
        </button>
      </div>
      {busy && (
        <p className="cera-note" role="status">
          {busy}
        </p>
      )}
      {error && (
        <p className="cera-status cera-status--error" role="alert">
          {error}
        </p>
      )}
      <MediaLibrary find={media.find} kinds={['image']} isSelected={() => false} onPick={insert} />
    </div>
  );
}

/** Alt text for the selected image. */
function ImageAlt({ editor }: { editor: Editor }) {
  const alt = String(editor.getAttributes('image').alt ?? '');
  return (
    <div className="cera-rich__panel" role="group" aria-label="Selected image">
      <label className="cera-inline cera-rich__grow">
        Image alt text
        <input
          type="text"
          value={alt}
          placeholder="Describe the image for people who can’t see it"
          onChange={(e) => {
            // Changing an attribute replaces the image node, which drops the selection; select it again so this box stays.
            const pos = editor.state.selection.from;
            editor.chain().updateAttributes('image', { alt: e.target.value }).setNodeSelection(pos).run();
          }}
        />
      </label>
    </div>
  );
}
