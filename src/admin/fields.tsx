'use client';
/**
 * Admin form generated from a FieldMap. One control per `field.kind`; kinds
 * without a control yet are shown read-only and their value is kept.
 *
 * Values are the raw stored JSON (`unknown`), not parsed data: the editor
 * must round-trip whatever is stored, including invalid values the editor is
 * still fixing and keys it doesn't know.
 */
import { useEffect, useId, useState, type ComponentType, type ReactNode } from 'react';
import type { AnyField, FieldMap, Option, OptionsContext, OptionsSource } from '../fields.ts';
import type { PageIssue } from '../document.ts';
import { GalleryInput, MediaInput, type MediaContext } from './media.tsx';
import { IconPicker, SvgInput, type IconsContext } from './icon-inputs.tsx';
import { RichTextInput } from './RichTextInput.tsx';
import { dateTimeInput, dateTimeValue, fieldDefault, getIn, humanize, issuesAt, moveItem, newId, newRepeaterItem, removeItem, setIn, type Path } from './state.ts';

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

/**
 * A site's own control for a `custom()` field kind. It gets the raw stored
 * value (unknown: check it), and sets a new one with onChange.
 */
export interface CustomControlProps {
  /** The input's id: the field's label points at it. */
  id: string;
  field: AnyField;
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly: boolean;
  context: FormContext;
}

/** Controls for `custom()` kinds, by kind: `{ color: ColorPicker }`. */
export type CustomControls = Record<string, ComponentType<CustomControlProps>>;

export interface FormContext {
  issues: readonly PageIssue[];
  options: OptionsContext;
  readOnly: boolean;
  /** Finds pages for `relation` fields (a server action). Without it, relations take pasted ids. */
  findPages?: (query: PageQuery) => Promise<PageOption[]>;
  /** Uploads and the media library. Without it, media fields take typed paths and URLs only. */
  media?: MediaContext;
  /** The site's icon sets, for `field.icon()` fields. Without it, icon fields take typed values (`lucide:rocket`). */
  icons?: IconsContext;
  /** The site's controls for `custom()` kinds. A kind without one shows read-only, its value kept. */
  controls?: CustomControls;
}

type Change = (value: unknown) => void;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const asString = (value: unknown): string => (typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value));
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const emptyToUndefined = (text: string): string | undefined => (text === '' ? undefined : text);

/* ------------------------------------------------------------------ */
/* Field map                                                           */
/* ------------------------------------------------------------------ */

export function FieldMapForm({
  fields,
  value,
  onChange,
  path,
  context,
}: {
  fields: FieldMap;
  value: unknown;
  onChange: Change;
  path: Path;
  context: FormContext;
}) {
  const objectValue = isObject(value) ? value : {};
  return (
    <div className="cera-fields">
      {Object.entries(fields).map(([key, field]) => (
        <FieldRow
          key={key}
          name={key}
          field={field}
          value={objectValue[key]}
          onChange={(fieldValue) => onChange(setIn(objectValue, [key], fieldValue))}
          path={[...path, key]}
          siblings={objectValue}
          context={context}
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
  context: FormContext;
}

function FieldRow(props: FieldProps) {
  const { name, field, value, path, context } = props;
  const id = useId();
  const label = field.meta.label ?? humanize(name);
  const own = issuesAt(context.issues, path);
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

  const className = `cera-field cera-field--${field.kind}${own.some((issue) => issue.severity === 'error') ? ' has-error' : own.length ? ' has-warning' : ''}`;

  // Every field is a two-column row: label on the left, control and
  // its note/counter/issues on the right (stacked in narrow containers).
  if (field.kind === 'toggle') {
    return (
      <div className={className}>
        <label htmlFor={id} className="cera-field__label">
          {label}
        </label>
        <input type="checkbox" id={id} checked={value === true} disabled={context.readOnly} onChange={(event) => props.onChange(event.target.checked)} />
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
      {issues.map((issue, n) => (
        <li key={n} className={`cera-issue cera-issue--${issue.severity}`}>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

function Control({ field, value, onChange, path, siblings, context, id }: FieldProps & { id: string }): ReactNode {
  const readOnly = context.readOnly;
  switch (field.kind) {
    case 'icon':
      if (context.icons) return <IconPicker value={value} onChange={onChange} icons={context.icons} readOnly={readOnly} id={id} />;
    // falls through: without the icon sets, a typed value
    case 'text':
    case 'url':
      return (
        <input
          id={id}
          type="text"
          value={asString(value)}
          readOnly={readOnly}
          inputMode={field.kind === 'url' ? 'url' : undefined}
          placeholder={field.kind === 'url' ? '/path or https://…' : undefined}
          onChange={(event) => onChange(emptyToUndefined(event.target.value))}
        />
      );

    case 'email':
    case 'phone':
      return (
        <input
          id={id}
          type={field.kind === 'email' ? 'email' : 'tel'}
          value={asString(value)}
          readOnly={readOnly}
          autoComplete="off"
          placeholder={field.kind === 'email' ? 'name@example.com' : undefined}
          onChange={(event) => onChange(emptyToUndefined(event.target.value))}
        />
      );

    case 'dateTime':
      return <DateTimeInput id={id} value={value} onChange={onChange} readOnly={readOnly} />;

    case 'timezone':
      return <TimeZoneSelect id={id} value={value} onChange={onChange} readOnly={readOnly} />;

    case 'imageLink': {
      const link = isObject(value) ? value : {};
      // An empty link with Modal off is no link at all.
      const update = (next: Record<string, unknown>) => onChange(asString(next.url) === '' && next.modal !== true ? undefined : { url: '', ...next });
      return (
        <div className="cera-group">
          <input
            id={id}
            type="text"
            value={asString(link.url)}
            readOnly={readOnly}
            inputMode="url"
            placeholder="/path or https://…"
            onChange={(event) => update(setIn(link, ['url'], event.target.value))}
          />
          <label className="cera-check">
            <input type="checkbox" checked={link.modal === true} disabled={readOnly} onChange={(event) => update(setIn(link, ['modal'], event.target.checked))} />
            Open in a modal
          </label>
        </div>
      );
    }

    case 'svg':
      return <SvgInput value={value} onChange={onChange} readOnly={readOnly} id={id} />;

    case 'textarea':
      return <textarea id={id} rows={3} value={asString(value)} readOnly={readOnly} onChange={(event) => onChange(emptyToUndefined(event.target.value))} />;

    case 'html':
      return (
        <RichTextInput
          id={id}
          labelledBy={`${id}-label`}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          toolbar={(field.config as { toolbar?: 'full' | 'limited' } | undefined)?.toolbar}
          media={context.media}
        />
      );

    case 'number':
    case 'perRow': {
      const config = (field.config ?? {}) as { min?: number; max?: number };
      return (
        <input
          id={id}
          type="number"
          value={typeof value === 'number' ? value : ''}
          min={field.kind === 'perRow' ? 1 : config.min}
          max={config.max}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
        />
      );
    }

    case 'select': {
      const options = (field.config as { options: Record<string, string> }).options;
      return (
        // Nothing stored yet: show the default the page will use, not the first option.
        <select id={id} value={asString(value ?? fieldDefault(field))} disabled={readOnly} onChange={(event) => onChange(emptyToUndefined(event.target.value))}>
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
      return <SelectFrom field={field} value={value} onChange={onChange} id={id} context={context} />;

    case 'media':
      return <MediaInput value={value} onChange={onChange} readOnly={readOnly} media={context.media} accept={(field.config as { accept?: Array<'image' | 'video' | 'embed'> } | undefined)?.accept} />;

    case 'background': {
      const background = isObject(value) ? value : {};
      return (
        <div className="cera-group">
          <ColorInput value={background.color} colors={context.options.colors} readOnly={readOnly} onChange={(color) => onChange(setIn(background, ['color'], color))} />
          <MediaInput value={background.media} onChange={(media) => onChange(setIn(background, ['media'], media))} readOnly={readOnly} media={context.media} accept={['image', 'video']} />
          <label className="cera-check">
            <input type="checkbox" checked={background.overlay === true} disabled={readOnly} onChange={(event) => onChange(setIn(background, ['overlay'], event.target.checked))} />
            Dark overlay
          </label>
        </div>
      );
    }

    case 'cta':
      return value === undefined ? (
        <button type="button" className="cera-button cera-button--small" disabled={readOnly} onClick={() => onChange({ text: '', url: '' })}>
          Add call to action
        </button>
      ) : (
        <CtaInput value={value} onChange={onChange} onRemove={() => onChange(undefined)} readOnly={readOnly} />
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
              onChange={(itemValue) => onChange(setIn(list, [i], itemValue))}
              onRemove={() => onChange(removeItem(list, i))}
              onMove={(delta) => onChange(moveItem(list, i, i + delta))}
              readOnly={readOnly}
            />
          ))}
          <button
            type="button"
            className="cera-button cera-button--small"
            disabled={readOnly || (limit !== undefined && list.length >= limit)}
            onClick={() => onChange([...list, { text: '', url: '' }])}
          >
            Add call to action
          </button>
        </div>
      );
    }

    case 'gallery':
      return <GalleryInput value={value} onChange={onChange} readOnly={readOnly} media={context.media} limit={(field.config as { limit?: number } | undefined)?.limit} />;

    case 'repeater':
      return <Repeater field={field} value={value} onChange={onChange} path={path} context={context} />;

    case 'relation': {
      if (context.findPages) return <PagePicker field={field} value={value} onChange={onChange} siblings={siblings} context={context} findPages={context.findPages} id={id} />;
      const ids = asArray(value).map(asString);
      return (
        <>
          <input
            id={id}
            type="text"
            value={ids.join(', ')}
            readOnly={readOnly}
            placeholder="Page ids, comma-separated"
            onChange={(event) => onChange(event.target.value.split(',').map((pageId) => pageId.trim()).filter(Boolean))}
          />
          <p className="cera-note">This admin has no page search; paste page ids.</p>
        </>
      );
    }

    default: {
      const Custom = context.controls?.[field.kind];
      if (Custom) return <Custom id={id} field={field} value={value} onChange={onChange} readOnly={readOnly} context={context} />;
      return (
        <>
          <pre className="cera-readonly">{JSON.stringify(value, null, 2) ?? '(empty)'}</pre>
          <p className="cera-note">No editor for “{field.kind}” fields yet. The stored value is kept as is.</p>
        </>
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Compound controls                                                   */
/* ------------------------------------------------------------------ */

/** The browser's time zone, e.g. "America/Chicago". */
function timeZoneName(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/** Every IANA time zone the browser knows, with UTC first. */
function timeZones(): string[] {
  const known = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return ['UTC', ...known.filter((name) => name !== 'UTC')];
}

/** True once in the browser. The server knows neither the editor's time zone nor the browser's list of zones. */
function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function DateTimeInput({ id, value, onChange, readOnly }: { id: string; value: unknown; onChange: Change; readOnly: boolean }) {
  const mounted = useMounted();
  const zone = mounted ? timeZoneName() : undefined;
  return (
    <span className="cera-date-time">
      <input id={id} type="datetime-local" value={mounted ? dateTimeInput(value) : ''} readOnly={readOnly || !mounted} onChange={(event) => onChange(dateTimeValue(event.target.value))} />
      <span className="cera-note">In your time zone{zone ? ` (${zone.replace(/_/g, ' ')})` : ''}</span>
    </span>
  );
}

function TimeZoneSelect({ id, value, onChange, readOnly }: { id: string; value: unknown; onChange: Change; readOnly: boolean }) {
  const mounted = useMounted();
  const zones = mounted ? timeZones() : [];
  const current = asString(value);
  return (
    <select id={id} value={current} disabled={readOnly} onChange={(event) => onChange(emptyToUndefined(event.target.value))}>
      <option value="">—</option>
      {current && !zones.includes(current) && <option value={current}>{mounted ? `${current} (unknown)` : current.replace(/_/g, ' ')}</option>}
      {zones.map((zone) => (
        <option key={zone} value={zone}>
          {zone.replace(/_/g, ' ')}
        </option>
      ))}
    </select>
  );
}

/**
 * A background's color: picked from the site's palette when it has one
 * (FormContext.options.colors), typed otherwise.
 */
function ColorInput({ value, colors, onChange, readOnly }: { value: unknown; colors?: Option[]; onChange: (color: string | undefined) => void; readOnly: boolean }) {
  const current = asString(value);
  const swatch = current && <span className="cera-swatch" style={{ background: current }} aria-hidden="true" />;
  if (!colors?.length) {
    return (
      <label className="cera-inline">
        Color
        <span className="cera-color">
          {swatch}
          <input type="text" value={current} placeholder="#2b2118" readOnly={readOnly} onChange={(event) => onChange(emptyToUndefined(event.target.value))} />
        </span>
      </label>
    );
  }
  const known = colors.some((color) => color.value.toLowerCase() === current.toLowerCase());
  return (
    <label className="cera-inline">
      Color
      <span className="cera-color">
        {swatch}
        <select value={known ? colors.find((color) => color.value.toLowerCase() === current.toLowerCase())!.value : current} disabled={readOnly} onChange={(event) => onChange(emptyToUndefined(event.target.value))}>
          <option value="">None</option>
          {current && !known && <option value={current}>{current} (not in the palette)</option>}
          {colors.map((color) => (
            <option key={color.value} value={color.value}>
              {color.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

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
        <input type="text" value={asString(cta.text)} readOnly={readOnly} onChange={(event) => onChange(setIn(cta, ['text'], event.target.value))} />
      </label>
      <label className="cera-inline">
        Link
        <input type="text" value={asString(cta.url)} placeholder="about or https://…" readOnly={readOnly} onChange={(event) => onChange(setIn(cta, ['url'], event.target.value))} />
      </label>
      <label className="cera-inline">
        Opens in
        <select value={asString(cta.target) || '_self'} disabled={readOnly} onChange={(event) => onChange(setIn(cta, ['target'], event.target.value))}>
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
          <button type="button" className="cera-icon-button" aria-label="Move up" title="Move up" disabled={readOnly} onClick={(event) => { event.preventDefault(); onMove(-1); }}>
            ↑
          </button>
          <button type="button" className="cera-icon-button" aria-label="Move down" title="Move down" disabled={readOnly} onClick={(event) => { event.preventDefault(); onMove(1); }}>
            ↓
          </button>
        </>
      )}
      <button type="button" className="cera-icon-button cera-danger" aria-label="Remove" title="Remove" disabled={readOnly} onClick={(event) => { event.preventDefault(); onRemove(); }}>
        ✕
      </button>
    </div>
  );
}

function Repeater({ field, value, onChange, path, context }: { field: AnyField; value: unknown; onChange: Change; path: Path; context: FormContext }) {
  const config = field.config as { fields: FieldMap; limit?: number; itemTitle?: string };
  const items = asArray(value);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const itemId = (item: unknown, i: number) => (isObject(item) && typeof item._id === 'string' ? item._id : `index-${i}`);

  const add = () => {
    const item = newRepeaterItem(config.fields, newId());
    setOpen((previous) => new Set(previous).add(item._id as string));
    onChange([...items, item]);
  };

  return (
    <div className="cera-list">
      {items.map((item, i) => {
        const key = itemId(item, i);
        const title = config.itemTitle ? asString(getIn(item, [config.itemTitle])) : '';
        const itemIssues = issuesAt(context.issues, [...path, i]);
        return (
          <details
            key={key}
            className={`cera-item${itemIssues.length ? ' has-warning' : ''}`}
            open={open.has(key) || itemIssues.length > 0}
            onToggle={(event) => {
              const isOpen = (event.currentTarget as HTMLDetailsElement).open;
              setOpen((previous) => {
                const next = new Set(previous);
                if (isOpen) next.add(key);
                else next.delete(key);
                return next;
              });
            }}
          >
            <summary>
              <span className="cera-item-title">{title || `Item ${i + 1}`}</span>
              <ItemButtons onMove={(delta) => onChange(moveItem(items, i, i + delta))} onRemove={() => onChange(removeItem(items, i))} readOnly={context.readOnly} />
            </summary>
            <FieldMapForm fields={config.fields} value={item} onChange={(itemValue) => onChange(setIn(items, [i], itemValue))} path={[...path, i]} context={context} />
          </details>
        );
      })}
      <button type="button" className="cera-button cera-button--small" disabled={context.readOnly || (config.limit !== undefined && items.length >= config.limit)} onClick={add}>
        Add item
      </button>
      {config.limit !== undefined && <p className="cera-note">Up to {config.limit}.</p>}
    </div>
  );
}

function SelectFrom({ field, value, onChange, id, context }: { field: AnyField; value: unknown; onChange: Change; id: string; context: FormContext }) {
  const config = field.config as { options: OptionsSource; multiple: boolean };
  const [options, setOptions] = useState<Option[] | null>(null);
  useEffect(() => {
    let live = true;
    Promise.resolve(config.options(context.options)).then((loadedOptions) => live && setOptions(loadedOptions));
    return () => {
      live = false;
    };
  }, [config, context.options]);

  if (!options) return <p className="cera-note">Loading options…</p>;

  if (config.multiple) {
    const selected = new Set(asArray(value).map(asString));
    return (
      <div className="cera-checks">
        {options.map((option) => (
          <label key={option.value} className="cera-check">
            <input
              type="checkbox"
              checked={selected.has(option.value)}
              disabled={context.readOnly}
              onChange={(event) => {
                const next = new Set(selected);
                if (event.target.checked) next.add(option.value);
                else next.delete(option.value);
                onChange([...next]);
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
    );
  }
  return (
    <select id={id} value={asString(value)} disabled={context.readOnly} onChange={(event) => onChange(emptyToUndefined(event.target.value))}>
      <option value="">—</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
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
  context,
  findPages,
  id,
}: {
  field: AnyField;
  value: unknown;
  onChange: Change;
  siblings: Record<string, unknown>;
  context: FormContext;
  findPages: NonNullable<FormContext['findPages']>;
  id: string;
}) {
  const config = field.config as { to: string[] | { field: string }; limit?: number };
  const ids = asArray(value).map(asString).filter(Boolean);
  const idsKey = ids.join(',');

  // Allowed content types: fixed, or read from a sibling field (theme: post_types_field). None ticked
  // means any type with pages of its own (not forms, which only show inside other pages).
  const picked0 = Array.isArray(config.to) ? config.to : asArray(siblings[config.to.field]).map(asString).filter(Boolean);
  const types = picked0.length > 0 ? picked0 : context.options.contentTypes.filter((contentType) => contentType.public).map((contentType) => contentType.name);
  const typesKey = types.join(',');
  const labelOf = (name: string) => context.options.contentTypes.find((contentType) => contentType.name === name)?.label ?? name;

  // Details for the picked ids.
  const [picked, setPicked] = useState<PageOption[]>([]);
  useEffect(() => {
    if (!idsKey) return setPicked([]);
    let live = true;
    findPages({ ids: idsKey.split(',') }).then((pages) => live && setPicked(pages));
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
    const timer = setTimeout(() => {
      findPages({ search, contentTypes: typesKey ? typesKey.split(',') : undefined }).then((pages) => live && setResults(pages));
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, search, typesKey, findPages]);

  const single = config.limit === 1;
  const full = config.limit !== undefined && ids.length >= config.limit && !single;
  const pick = (page: PageOption) => {
    onChange(single ? [page.id] : [...ids, page.id]);
    setSearch('');
    setOpen(false);
  };
  const choices = (results ?? []).filter((result) => !ids.includes(result.id)).slice(0, 8);

  return (
    <div className="cera-picker">
      {ids.length === 0 ? (
        <p className="cera-note">No page picked.</p>
      ) : (
        <ul className="cera-picker__picked">
          {ids.map((pageId, i) => {
            const page = picked.find((pickedPage) => pickedPage.id === pageId);
            return (
              <li key={pageId}>
                <span className="cera-picker__title">{page ? page.title || page.slug : 'Page not found'}</span>
                <span className="cera-picker__meta">
                  {page ? `${page.contentTypeLabel} · ${page.slug}` : 'It may have been deleted. Remove it or pick another.'}
                </span>
                {page && !page.published && <span className="cera-badge cera-badge--dirty">Not published: hidden on the live site</span>}
                {!context.readOnly && (
                  <button type="button" className="cera-icon-button cera-danger" aria-label="Remove page" title="Remove" onClick={() => onChange(removeItem(ids, i))}>
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!context.readOnly && !full && (
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
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setOpen(false);
              if (event.key === 'Enter' && choices[0]) {
                event.preventDefault();
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
                choices.map((page) => (
                  <li key={page.id} role="option" aria-selected={false}>
                    {/* mousedown fires before the input's blur, which would close the list first. */}
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => pick(page)}>
                      <span className="cera-picker__title">{page.title || page.slug}</span>
                      <span className="cera-picker__meta">
                        {page.contentTypeLabel} · {page.slug}
                        {page.published ? '' : ' · not published'}
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
