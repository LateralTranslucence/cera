/**
 * Pure helpers for editing a stored page in the admin. No React here, so
 * they can be tested on their own.
 */
import type { z } from 'zod';
import type { AnyField, FieldMap } from '../fields.ts';
import type { AnyPanel } from '../panel.ts';
import type { StoredPanel } from '../migrate.ts';
import type { IssuePath, PageIssue } from '../document.ts';

export type Path = IssuePath;

type Container = Record<string, unknown> | unknown[];

function isContainer(value: unknown): value is Container {
  return typeof value === 'object' && value !== null;
}

export function getIn(value: unknown, path: Path): unknown {
  let cur = value;
  for (const key of path) {
    if (!isContainer(cur)) return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

/**
 * Immutable set. Missing containers are created (an array when the next key
 * is a number). Setting an object key to `undefined` removes the key, so
 * cleared optional fields don't linger as `undefined` in stored JSON.
 */
export function setIn<Value>(value: Value, path: Path, next: unknown): Value {
  if (path.length === 0) return next as Value;
  const [key, ...rest] = path as [string | number, ...Path];
  const base: Container = isContainer(value) ? value : typeof key === 'number' ? [] : {};
  const child = setIn((base as Record<string | number, unknown>)[key], rest, next);

  if (Array.isArray(base)) {
    const copy = [...base];
    copy[key as number] = child;
    return copy as Value;
  }
  const copy: Record<string, unknown> = { ...base };
  if (child === undefined && rest.length === 0) delete copy[key as string];
  else copy[key as string] = child;
  return copy as Value;
}

export function moveItem<Item>(list: readonly Item[], from: number, to: number): Item[] {
  if (to < 0 || to >= list.length || from === to) return [...list];
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as Item);
  return copy;
}

export function removeItem<Item>(list: readonly Item[], index: number): Item[] {
  return list.filter((_, i) => i !== index);
}

/** The value a field takes when nothing is stored (its default), or `undefined`. */
export function fieldDefault(field: AnyField): unknown {
  const result = (field.schema as z.ZodType).safeParse(undefined);
  return result.success ? result.data : undefined;
}

export function defaultsFor(fields: FieldMap): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields)) {
    const defaultValue = fieldDefault(field);
    if (defaultValue !== undefined) out[key] = defaultValue;
  }
  return out;
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

/** A new panel instance with its defaults filled in, at the definition's current version. */
export function newPanel(def: AnyPanel, id = newId()): StoredPanel {
  return { id, type: def.type, v: def.version, hidden: false, data: defaultsFor(def.fields) };
}

export function newRepeaterItem(fields: FieldMap, id = newId()): Record<string, unknown> {
  return { _id: id, ...defaultsFor(fields) };
}

function startsWith(path: Path, prefix: Path): boolean {
  return prefix.length <= path.length && prefix.every((key, i) => String(path[i]) === String(key));
}

/** Issues at `path` or below it. With `exact`, only issues at `path` itself. */
export function issuesAt(issues: readonly PageIssue[], path: Path, exact = false): PageIssue[] {
  return issues.filter((issue) => (exact ? issue.path.length === path.length && startsWith(issue.path, path) : startsWith(issue.path, path)));
}

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** "anchorId" → "Anchor id". Used when a field has no label. */
export function humanize(key: string): string {
  // Short keys are usually acronyms: "seo" → "SEO", "cta" → "CTA".
  if (/^[a-z]{2,3}$/.test(key)) return key.toUpperCase();
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const plainText = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, '’')
    .replace(/\s+/g, ' ')
    .trim();

/** A folded panel's name: its title, or the panel type's label. */
export function panelName(def: AnyPanel | undefined, data: Record<string, unknown>, type: string): string {
  // Panels have titles; form fields have labels (or a section's legend).
  for (const key of ['title', 'label', 'legend']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return plainText(value);
  }
  return def?.label ?? type;
}

/** A copy of a panel with a new id, placed right after it. */
export function duplicatePanel(list: readonly StoredPanel[], index: number, id = newId()): StoredPanel[] {
  const original = list[index];
  if (!original) return [...list];
  const copy = [...list];
  copy.splice(index + 1, 0, { ...structuredClone(original), id });
  return copy;
}
