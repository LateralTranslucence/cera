'use client';
/**
 * Admin form generated from a FieldMap. One control per `field.kind`; kinds
 * without a control yet are shown read-only and their value is kept.
 *
 * Values are the raw stored JSON (`unknown`), not parsed data: the editor
 * must round-trip whatever is stored, including invalid values the editor is
 * still fixing and keys it doesn't know.
 */
import { useEffect, useId, useState, type ReactNode } from 'react';
import type { AnyField, FieldMap, Option, OptionsContext, OptionsSource } from '../fields.ts';
import type { PageIssue } from '../document.ts';
import { GalleryInput, MediaInput, type MediaContext } from './media.tsx';
import { RichTextInput } from './RichTextInput.tsx';
import { fieldDefault, getIn, humanize, issuesAt, moveItem, newId, newRepeaterItem, removeItem, setIn, type Path } from './state.ts';

/** What the page picker asks for: by ids (to show picked pages), or a search within content types. */
export interface PageQuery {
  ids?: string[];
  contentTypes?: string[];
  search?: string;
}

/** A page offered by the page picker. */
export interface PageOption {
  id: string;
  title: string;
  slug: string;
  contentType: string;
  contentTypeLabel: string;
  published: boolean;
}

export interface FormContext {
  issues: readonly PageIssue[];
  options: OptionsContext;
  readOnly: boolean;
  /** Finds pages for `relation` fields (a server action). Without it, relations take pasted ids. */
  findPages?: (query: PageQuery) => Promise<PageOption[]>;
  /** Uploads and the media library. Without it, media fields take typed paths and URLs only. */
  media?: MediaContext;
}

type Change = (value: unknown) => void;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const asString = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const emptyToUndefined = (s: string): string | undefined => (s === '' ? undefined : s);

/* ------------------------------------------------------------------ */
/* Field map                                                           */
/* ------------------------------------------------------------------ */

export function FieldMapForm({
  fields,
  value,
  onChange,
  path,
  ctx,
}: {
  fields: FieldMap;
  value: unknown;
  onChange: Change;
  path: Path;
  ctx: FormContext;
}) {
  const obj = isObject(value) ? value : {};
  return (
    <div className="cera-fields">
      {Object.entries(fields).map(([key, field]) => (
        <FieldRow
          key={key}
          name={key}
          field={field}
          value={obj[key]}
          onChange={(v) => onChange(setIn(obj, [key], v))}
          path={[...path, key]}
          siblings={obj}
          ctx={ctx}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One field: label, control, note, counter, issues                    */
/* ------------------------------------------------------------------ */

const GROUP_KINDS = new Set(['html', 'media', 'gallery', 'background', 'cta', 'ctas', 'repeater', 'selectFrom', 'relation']);

interface FieldProps {
  name: string;
  field: AnyField;
  value: unknown;
  onChange: Change;
  path: Path;
  /** The other values at the same level (e.g. a relation reads the content types picked in a sibling field). */
  siblings: Record<string, unknown>;
  ctx: FormContext;
}

function FieldRow(props: FieldProps) {
  const { name, field, value, path, ctx } = props;
  const id = useId();
  const label = field.meta.label ?? humanize(name);
  const own = issuesAt(ctx.issues, path);
  const max = field.meta.maxLength;
  const length = typeof value === 'string' ? value.length : 0;
  const group = GROUP_KINDS.has(field.kind) && !(field.kind === 'selectFrom' && !(field.config as { multiple: boolean }).multiple);

  const extras = (
    <>
      {field.meta.note && <p className="cera-note">{field.meta.note}</p>}
      {max !== undefined && (
        <p className={`cera-counter${length > max ? ' is-over' : ''}`} aria-live="polite">
          {length}/{max}
        </p>
      )}
      <IssueList issues={own} />
    </>
  );

  const className = `cera-field cera-field--${field.kind}${own.some((i) => i.severity === 'error') ? ' has-error' : own.length ? ' has-warning' : ''}`;

  // Every field is a two-column row: label on the left, control and
  // its note/counter/issues on the right (stacked in narrow containers).
  if (field.kind === 'toggle') {
    return (
      <div className={className}>
        <label htmlFor={id} className="cera-field__label">
          {label}
        </label>
        <input type="checkbox" id={id} checked={value === true} disabled={ctx.readOnly} onChange={(e) => props.onChange(e.target.checked)} />
        {extras}
      </div>
    );
  }

  if (group) {
    // Several inputs: a labeled group rather than a fieldset, so the label can sit in the left column.
    return (
      <div className={className} role="group" aria-labelledby={`${id}-label`} data-field={name}>
        <span id={`${id}-label`} className="cera-field__label">
          {label}
        </span>
        <Control {...props} id={id} />
        {extras}
      </div>
    );
  }

  return (
    <div className={className} data-field={name}>
      <label htmlFor={id} className="cera-field__label">
        {label}
      </label>
      <Control {...props} id={id} />
      {extras}
    </div>
  );
}

export function IssueList({ issues }: { issues: readonly PageIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="cera-issues">
      {issues.map((i, n) => (
        <li key={n} className={`cera-issue cera-issue--${i.severity}`}>
          {i.message}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

function Control({ field, value, onChange, path, siblings, ctx, id }: FieldProps & { id: string }): ReactNode {
  const ro = ctx.readOnly;
  switch (field.kind) {
    case 'text':
    case 'url':
    case 'icon':
      return (
        <input
          id={id}
          type="text"
          value={asString(value)}
          readOnly={ro}
          inputMode={field.kind === 'url' ? 'url' : undefined}
          placeholder={field.kind === 'url' ? '/path or https://…' : undefined}
          onChange={(e) => onChange(emptyToUndefined(e.target.value))}
        />
      );

    case 'textarea':
      return <textarea id={id} rows={3} value={asString(value)} readOnly={ro} onChange={(e) => onChange(emptyToUndefined(e.target.value))} />;

    case 'html':
      return (
        <RichTextInput
          id={id}
          labelledBy={`${id}-label`}
          value={value}
          onChange={onChange}
          readOnly={ro}
          toolbar={(field.config as { toolbar?: 'full' | 'limited' } | undefined)?.toolbar}
          media={ctx.media}
        />
      );

    case 'number':
    case 'perRow': {
      const cfg = (field.config ?? {}) as { min?: number; max?: number };
      return (
        <input
          id={id}
          type="number"
          value={typeof value === 'number' ? value : ''}
          min={field.kind === 'perRow' ? 1 : cfg.min}
          max={cfg.max}
          readOnly={ro}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      );
    }

    case 'select': {
      const options = (field.config as { options: Record<string, string> }).options;
      return (
        <select id={id} value={asString(value)} disabled={ro} onChange={(e) => onChange(emptyToUndefined(e.target.value))}>
          {fieldDefault(field) === undefined && <option value="">—</option>}
          {value !== undefined && !(asString(value) in options) && <option value={asString(value)}>{asString(value)} (not an option)</option>}
          {Object.entries(options).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      );
    }

    case 'selectFrom':
      return <SelectFrom field={field} value={value} onChange={onChange} id={id} ctx={ctx} />;

    case 'media':
      return <MediaInput value={value} onChange={onChange} readOnly={ro} media={ctx.media} accept={(field.config as { accept?: Array<'image' | 'video' | 'embed'> } | undefined)?.accept} />;

    case 'background': {
      const bg = isObject(value) ? value : {};
      return (
        <div className="cera-group">
          <label className="cera-inline">
            Color
            <input type="text" value={asString(bg.color)} placeholder="#2b2118" readOnly={ro} onChange={(e) => onChange(setIn(bg, ['color'], emptyToUndefined(e.target.value)))} />
          </label>
          <MediaInput value={bg.media} onChange={(m) => onChange(setIn(bg, ['media'], m))} readOnly={ro} media={ctx.media} accept={['image', 'video']} />
          <label className="cera-check">
            <input type="checkbox" checked={bg.overlay === true} disabled={ro} onChange={(e) => onChange(setIn(bg, ['overlay'], e.target.checked))} />
            Dark overlay
          </label>
        </div>
      );
    }

    case 'cta':
      return value === undefined ? (
        <button type="button" className="cera-button cera-button--small" disabled={ro} onClick={() => onChange({ text: '', url: '' })}>
          Add call to action
        </button>
      ) : (
        <CtaInput value={value} onChange={onChange} onRemove={() => onChange(undefined)} readOnly={ro} />
      );

    case 'ctas': {
      const list = asArray(value);
      const limit = (field.config as { limit?: number } | undefined)?.limit;
      return (
        <div className="cera-list">
          {list.map((cta, i) => (
            <CtaInput
              key={i}
              value={cta}
              onChange={(v) => onChange(setIn(list, [i], v))}
              onRemove={() => onChange(removeItem(list, i))}
              onMove={(d) => onChange(moveItem(list, i, i + d))}
              readOnly={ro}
            />
          ))}
          <button
            type="button"
            className="cera-button cera-button--small"
            disabled={ro || (limit !== undefined && list.length >= limit)}
            onClick={() => onChange([...list, { text: '', url: '' }])}
          >
            Add call to action
          </button>
        </div>
      );
    }

    case 'gallery':
      return <GalleryInput value={value} onChange={onChange} readOnly={ro} media={ctx.media} limit={(field.config as { limit?: number } | undefined)?.limit} />;

    case 'repeater':
      return <Repeater field={field} value={value} onChange={onChange} path={path} ctx={ctx} />;

    case 'relation': {
      if (ctx.findPages) return <PagePicker field={field} value={value} onChange={onChange} siblings={siblings} ctx={ctx} findPages={ctx.findPages} id={id} />;
      const ids = asArray(value).map(asString);
      return (
        <>
          <input
            id={id}
            type="text"
            value={ids.join(', ')}
            readOnly={ro}
            placeholder="Page ids, comma-separated"
            onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          />
          <p className="cera-note">This admin has no page search; paste page ids.</p>
        </>
      );
    }

    default:
      return (
        <>
          <pre className="cera-readonly">{JSON.stringify(value, null, 2) ?? '(empty)'}</pre>
          <p className="cera-note">No editor for “{field.kind}” fields yet. The stored value is kept as is.</p>
        </>
      );
  }
}

/* ------------------------------------------------------------------ */
/* Compound controls                                                   */
/* ------------------------------------------------------------------ */

function CtaInput({
  value,
  onChange,
  onRemove,
  onMove,
  readOnly,
}: {
  value: unknown;
  onChange: Change;
  onRemove: () => void;
  onMove?: (delta: -1 | 1) => void;
  readOnly: boolean;
}) {
  const cta = isObject(value) ? value : {};
  return (
    <div className="cera-group cera-cta">
      <label className="cera-inline">
        Text
        <input type="text" value={asString(cta.text)} readOnly={readOnly} onChange={(e) => onChange(setIn(cta, ['text'], e.target.value))} />
      </label>
      <label className="cera-inline">
        Link
        <input type="text" value={asString(cta.url)} placeholder="about or https://…" readOnly={readOnly} onChange={(e) => onChange(setIn(cta, ['url'], e.target.value))} />
      </label>
      <label className="cera-inline">
        Opens in
        <select value={asString(cta.target) || '_self'} disabled={readOnly} onChange={(e) => onChange(setIn(cta, ['target'], e.target.value))}>
          <option value="_self">Same tab</option>
          <option value="_blank">New tab</option>
          <option value="modal">Modal</option>
        </select>
      </label>
      <ItemButtons onMove={onMove} onRemove={onRemove} readOnly={readOnly} />
    </div>
  );
}

function ItemButtons({ onMove, onRemove, readOnly }: { onMove?: (delta: -1 | 1) => void; onRemove: () => void; readOnly: boolean }) {
  return (
    <div className="cera-item-buttons">
      {onMove && (
        <>
          <button type="button" className="cera-icon-button" aria-label="Move up" title="Move up" disabled={readOnly} onClick={(e) => { e.preventDefault(); onMove(-1); }}>
            ↑
          </button>
          <button type="button" className="cera-icon-button" aria-label="Move down" title="Move down" disabled={readOnly} onClick={(e) => { e.preventDefault(); onMove(1); }}>
            ↓
          </button>
        </>
      )}
      <button type="button" className="cera-icon-button cera-danger" aria-label="Remove" title="Remove" disabled={readOnly} onClick={(e) => { e.preventDefault(); onRemove(); }}>
        ✕
      </button>
    </div>
  );
}

function Repeater({ field, value, onChange, path, ctx }: { field: AnyField; value: unknown; onChange: Change; path: Path; ctx: FormContext }) {
  const cfg = field.config as { fields: FieldMap; limit?: number; itemTitle?: string };
  const items = asArray(value);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const itemId = (item: unknown, i: number) => (isObject(item) && typeof item._id === 'string' ? item._id : `index-${i}`);

  const add = () => {
    const item = newRepeaterItem(cfg.fields, newId());
    setOpen((s) => new Set(s).add(item._id as string));
    onChange([...items, item]);
  };

  return (
    <div className="cera-list">
      {items.map((item, i) => {
        const key = itemId(item, i);
        const title = cfg.itemTitle ? asString(getIn(item, [cfg.itemTitle])) : '';
        const itemIssues = issuesAt(ctx.issues, [...path, i]);
        return (
          <details
            key={key}
            className={`cera-item${itemIssues.length ? ' has-warning' : ''}`}
            open={open.has(key) || itemIssues.length > 0}
            onToggle={(e) => {
              const isOpen = (e.currentTarget as HTMLDetailsElement).open;
              setOpen((s) => {
                const next = new Set(s);
                if (isOpen) next.add(key);
                else next.delete(key);
                return next;
              });
            }}
          >
            <summary>
              <span className="cera-item-title">{title || `Item ${i + 1}`}</span>
              <ItemButtons onMove={(d) => onChange(moveItem(items, i, i + d))} onRemove={() => onChange(removeItem(items, i))} readOnly={ctx.readOnly} />
            </summary>
            <FieldMapForm fields={cfg.fields} value={item} onChange={(v) => onChange(setIn(items, [i], v))} path={[...path, i]} ctx={ctx} />
          </details>
        );
      })}
      <button type="button" className="cera-button cera-button--small" disabled={ctx.readOnly || (cfg.limit !== undefined && items.length >= cfg.limit)} onClick={add}>
        Add item
      </button>
      {cfg.limit !== undefined && <p className="cera-note">Up to {cfg.limit}.</p>}
    </div>
  );
}

function SelectFrom({ field, value, onChange, id, ctx }: { field: AnyField; value: unknown; onChange: Change; id: string; ctx: FormContext }) {
  const cfg = field.config as { options: OptionsSource; multiple: boolean };
  const [options, setOptions] = useState<Option[] | null>(null);
  useEffect(() => {
    let live = true;
    Promise.resolve(cfg.options(ctx.options)).then((o) => live && setOptions(o));
    return () => {
      live = false;
    };
  }, [cfg, ctx.options]);

  if (!options) return <p className="cera-note">Loading options…</p>;

  if (cfg.multiple) {
    const selected = new Set(asArray(value).map(asString));
    return (
      <div className="cera-checks">
        {options.map((o) => (
          <label key={o.value} className="cera-check">
            <input
              type="checkbox"
              checked={selected.has(o.value)}
              disabled={ctx.readOnly}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(o.value);
                else next.delete(o.value);
                onChange([...next]);
              }}
            />
            {o.label}
          </label>
        ))}
      </div>
    );
  }
  return (
    <select id={id} value={asString(value)} disabled={ctx.readOnly} onChange={(e) => onChange(emptyToUndefined(e.target.value))}>
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/* Page picker (relation fields)                                       */
/* ------------------------------------------------------------------ */

function PagePicker({
  field,
  value,
  onChange,
  siblings,
  ctx,
  findPages,
  id,
}: {
  field: AnyField;
  value: unknown;
  onChange: Change;
  siblings: Record<string, unknown>;
  ctx: FormContext;
  findPages: NonNullable<FormContext['findPages']>;
  id: string;
}) {
  const cfg = field.config as { to: string[] | { field: string }; limit?: number };
  const ids = asArray(value).map(asString).filter(Boolean);
  const idsKey = ids.join(',');

  // Allowed content types: fixed, or read from a sibling field (theme: post_types_field). None means any.
  const types = Array.isArray(cfg.to) ? cfg.to : asArray(siblings[cfg.to.field]).map(asString).filter(Boolean);
  const typesKey = types.join(',');
  const labelOf = (name: string) => ctx.options.contentTypes.find((t) => t.name === name)?.label ?? name;

  // Details for the picked ids.
  const [picked, setPicked] = useState<PageOption[]>([]);
  useEffect(() => {
    if (!idsKey) return setPicked([]);
    let live = true;
    findPages({ ids: idsKey.split(',') }).then((r) => live && setPicked(r));
    return () => {
      live = false;
    };
  }, [idsKey, findPages]);

  // Search results, shown while the search box has focus.
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PageOption[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(() => {
      findPages({ search, contentTypes: typesKey ? typesKey.split(',') : undefined }).then((r) => live && setResults(r));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [open, search, typesKey, findPages]);

  const single = cfg.limit === 1;
  const full = cfg.limit !== undefined && ids.length >= cfg.limit && !single;
  const pick = (p: PageOption) => {
    onChange(single ? [p.id] : [...ids, p.id]);
    setSearch('');
    setOpen(false);
  };
  const choices = (results ?? []).filter((r) => !ids.includes(r.id)).slice(0, 8);

  return (
    <div className="cera-picker">
      {ids.length === 0 ? (
        <p className="cera-note">No page picked.</p>
      ) : (
        <ul className="cera-picker__picked">
          {ids.map((pid, i) => {
            const p = picked.find((x) => x.id === pid);
            return (
              <li key={pid}>
                <span className="cera-picker__title">{p ? p.title || p.slug : 'Page not found'}</span>
                <span className="cera-picker__meta">
                  {p ? `${p.contentTypeLabel} · ${p.slug}` : 'It may have been deleted. Remove it or pick another.'}
                </span>
                {p && !p.published && <span className="cera-badge cera-badge--dirty">Not published: hidden on the live site</span>}
                {!ctx.readOnly && (
                  <button type="button" className="cera-icon-button cera-danger" aria-label="Remove page" title="Remove" onClick={() => onChange(removeItem(ids, i))}>
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!ctx.readOnly && !full && (
        <div className="cera-picker__search">
          <input
            id={id}
            type="search"
            value={search}
            placeholder={single && ids.length ? 'Search to replace the page…' : 'Search pages…'}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-results`}
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              if (e.key === 'Enter' && choices[0]) {
                e.preventDefault();
                pick(choices[0]);
              }
            }}
          />
          {open && (
            <ul className="cera-picker__results" id={`${id}-results`} role="listbox">
              {results === null ? (
                <li className="cera-note">Searching…</li>
              ) : choices.length === 0 ? (
                <li className="cera-note">No matching pages.</li>
              ) : (
                choices.map((p) => (
                  <li key={p.id} role="option" aria-selected={false}>
                    {/* mousedown fires before the input's blur, which would close the list first. */}
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)}>
                      <span className="cera-picker__title">{p.title || p.slug}</span>
                      <span className="cera-picker__meta">
                        {p.contentTypeLabel} · {p.slug}
                        {p.published ? '' : ' · not published'}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
      {types.length > 0 && <p className="cera-note">Only {types.map(labelOf).join(', ')} pages.</p>}
    </div>
  );
}
