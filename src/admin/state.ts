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

function isContainer(v: unknown): v is Container {
  return typeof v === 'object' && v !== null;
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
export function setIn<T>(value: T, path: Path, next: unknown): T {
  if (path.length === 0) return next as T;
  const [key, ...rest] = path as [string | number, ...Path];
  const base: Container = isContainer(value) ? value : typeof key === 'number' ? [] : {};
  const child = setIn((base as Record<string | number, unknown>)[key], rest, next);

  if (Array.isArray(base)) {
    const copy = [...base];
    copy[key as number] = child;
    return copy as T;
  }
  const copy: Record<string, unknown> = { ...base };
  if (child === undefined && rest.length === 0) delete copy[key as string];
  else copy[key as string] = child;
  return copy as T;
}

export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return [...list];
  const copy = [...list];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}

export function removeItem<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

/** The value a field takes when nothing is stored (its default), or `undefined`. */
export function fieldDefault(field: AnyField): unknown {
  const r = (field.schema as z.ZodType).safeParse(undefined);
  return r.success ? r.data : undefined;
}

export function defaultsFor(fields: FieldMap): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields)) {
    const d = fieldDefault(field);
    if (d !== undefined) out[key] = d;
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
  return prefix.length <= path.length && prefix.every((k, i) => String(path[i]) === String(k));
}

/** Issues at `path` or below it. With `exact`, only issues at `path` itself. */
export function issuesAt(issues: readonly PageIssue[], path: Path, exact = false): PageIssue[] {
  return issues.filter((i) => (exact ? i.path.length === path.length && startsWith(i.path, path) : startsWith(i.path, path)));
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
