'use client';
/**
 * Admin controls for icons: the picker for `f.icon()` fields, and the SVG
 * upload for `f.svg()` fields (the Icon content type's File).
 *
 * The picker searches every icon set the site has (custom icons, Lucide,
 * any it plugs in) through a server action, `icons.search`, and shows the
 * picked icon through `icons.get`. SVG from there is safe to inline: it
 * comes from set code or was cleaned on save.
 *
 * An uploaded SVG isn't cleaned until the page is saved, so its preview is an
 * <img>, where scripts can't run.
 */
import { useEffect, useId, useState } from 'react';
import type { IconGlyph } from '../icons/library.ts';
import { MAX_SVG_LENGTH } from '../fields.ts';

export interface IconSearchResult {
  sets: ReadonlyArray<{ name: string; label: string }>;
  icons: IconGlyph[];
}

/** What the icon picker needs: server actions over the site's icon library. */
export interface IconsContext {
  search: (query: string) => Promise<IconSearchResult>;
  get: (values: string[]) => Promise<IconGlyph[]>;
}

const Glyph = ({ glyph }: { glyph: IconGlyph }) => <span className="cera-icon-glyph" aria-hidden="true" dangerouslySetInnerHTML={{ __html: glyph.svg }} />;

export function IconPicker({
  value,
  onChange,
  icons,
  readOnly,
  id,
}: {
  value: unknown;
  onChange: (value: string | undefined) => void;
  icons: IconsContext;
  readOnly: boolean;
  id: string;
}) {
  const current = typeof value === 'string' && value ? value : undefined;

  // The picked icon, drawn.
  const [picked, setPicked] = useState<IconGlyph | null | undefined>(undefined);
  useEffect(() => {
    if (!current) return setPicked(undefined);
    let live = true;
    icons.get([current]).then((r) => live && setPicked(r.find((g) => g.value === current) ?? null));
    return () => {
      live = false;
    };
  }, [current, icons]);

  // The search panel.
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<IconSearchResult | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(() => icons.search(query).then((r) => live && setResult(r)), 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, query, icons]);

  const pick = (g: IconGlyph) => {
    onChange(g.value);
    setPicked(g);
    setOpen(false);
    setQuery('');
  };

  const groups = (result?.sets ?? [])
    .map((s) => ({ ...s, icons: (result?.icons ?? []).filter((g) => g.value.startsWith(`${s.name}:`)) }))
    .filter((s) => s.icons.length > 0);

  return (
    <div className="cera-icon-picker">
      <div className="cera-icon-picker__current">
        {current ? (
          <>
            <span className="cera-icon-picker__preview">{picked ? <Glyph glyph={picked} /> : null}</span>
            <span className="cera-icon-picker__name">
              <span className="cera-picker__title">{picked ? picked.label : picked === null ? 'Icon not found' : 'Loading…'}</span>
              <span className="cera-picker__meta">
                {picked === null ? 'It may have been deleted. Pick another or remove it.' : current}
                {picked?.note ? ` · ${picked.note}` : ''}
              </span>
            </span>
          </>
        ) : (
          <span className="cera-note">No icon.</span>
        )}
        {!readOnly && (
          <span className="cera-icon-picker__actions">
            <button type="button" className="cera-button cera-button--small" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen(!open)}>
              {current ? 'Change' : 'Choose icon'}
            </button>
            {current && (
              <button type="button" className="cera-button cera-button--small" onClick={() => onChange(undefined)}>
                Remove
              </button>
            )}
          </span>
        )}
      </div>

      {open && (
        <div className="cera-icon-picker__panel" id={`${id}-panel`}>
          <label htmlFor={id} className="cera-visually-hidden">
            Search icons
          </label>
          <input
            id={id}
            type="search"
            value={query}
            placeholder="Search icons, e.g. arrow, mail, star"
            autoComplete="off"
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
            }}
          />
          {result === null ? (
            <p className="cera-note">Searching…</p>
          ) : groups.length === 0 ? (
            <p className="cera-note">No icons match “{query}”.</p>
          ) : (
            groups.map((g) => (
              <section key={g.name} className="cera-icon-picker__group" aria-label={g.label}>
                <h4>{g.label}</h4>
                <ul className="cera-icon-picker__grid">
                  {g.icons.map((icon) => (
                    <li key={icon.value}>
                      <button
                        type="button"
                        aria-pressed={icon.value === current}
                        title={icon.note ? `${icon.label} (${icon.note})` : icon.label}
                        onClick={() => pick(icon)}
                      >
                        <Glyph glyph={icon} />
                        <span className="cera-icon-picker__label">{icon.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function SvgInput({ value, onChange, readOnly, id }: { value: unknown; onChange: (value: string | undefined) => void; readOnly: boolean; id: string }) {
  const svg = typeof value === 'string' && value ? value : undefined;
  const [error, setError] = useState<string | null>(null);
  const noteId = useId();

  const read = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') return setError('Pick an SVG file.');
    const text = await file.text();
    if (text.length > MAX_SVG_LENGTH) return setError(`That SVG is too large (over ${MAX_SVG_LENGTH.toLocaleString('en-US')} characters).`);
    if (!/<svg[\s>]/i.test(text)) return setError('That file doesn’t look like an SVG.');
    onChange(text);
  };

  return (
    <div className="cera-svg-input">
      {svg && (
        <span className="cera-svg-input__preview">
          {/* An <img>: scripts in an SVG that hasn't been cleaned yet can't run here. */}
          <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt="" />
        </span>
      )}
      {!readOnly && (
        <span className="cera-svg-input__actions">
          <input id={id} type="file" accept=".svg,image/svg+xml" aria-describedby={noteId} onChange={(e) => void read(e.target.files?.[0])} />
          {svg && (
            <button type="button" className="cera-button cera-button--small" onClick={() => onChange(undefined)}>
              Remove
            </button>
          )}
        </span>
      )}
      <p className="cera-note" id={noteId}>
        {svg ? 'The preview is in black; on the site the icon takes the color of the text around it.' : 'No file yet.'}
      </p>
      {error && (
        <p className="cera-issue cera-issue--error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
