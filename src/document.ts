/**
 * Reading and saving whole pages.
 *
 * Two rules drive this module:
 *
 * 1. **Reads are forgiving.** One bad panel must not take a page down. A field
 *    that fails validation falls back to its default; a panel that still can't
 *    be made valid (or whose type is unknown) is skipped. Every problem is
 *    reported as an issue instead of thrown.
 *
 * 2. **Saves never lose data.** Panels of unknown types, keys the definitions
 *    don't know and boxes that no longer exist are written back untouched.
 *    Drafts save with warnings (an editor halfway through a page must be able
 *    to save it); publishing requires every known field to be valid.
 */
import { z } from 'zod';
import type { AnyContentType, BoxMap, PageOf, PageStatus } from './content-type.ts';
import type { FieldMap } from './fields.ts';
import type { AnyPanel } from './panel.ts';
import { upgradePanel, type StoredPanel } from './migrate.ts';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type IssuePath = Array<string | number>;

export type IssueCode =
  | 'invalid-page' // the page envelope itself (id, slug, title, structure)
  | 'invalid-field' // one field failed validation
  | 'invalid-panel' // a panel was skipped on read
  | 'unknown-panel' // no definition for the panel's type
  | 'migration-failed' // stored panel couldn't be upgraded to the current version
  | 'duplicate-panel-id';

export interface PageIssue {
  severity: 'error' | 'warning';
  code: IssueCode;
  path: IssuePath;
  message: string;
  panelId?: string;
}

/** A page as stored in the database and exchanged with the admin. */
export interface StoredPage {
  id: string;
  contentType: string;
  slug: string;
  title: string;
  boxes: Record<string, Record<string, unknown>>;
  panels: StoredPanel[];
}

export type SaveMode = 'draft' | 'publish';

export interface ReadResult<P> {
  page: P;
  issues: PageIssue[];
}

export type PrepareResult =
  | { ok: true; page: StoredPage; issues: PageIssue[] }
  | { ok: false; page?: StoredPage; issues: PageIssue[] };

/** Thrown by `readPage` when the row isn't a page at all (wrong content type, missing id…). */
export class PageShapeError extends Error {
  constructor(
    message: string,
    readonly issues: PageIssue[],
  ) {
    super(message);
    this.name = 'PageShapeError';
  }
}

/* ------------------------------------------------------------------ */
/* Envelope                                                            */
/* ------------------------------------------------------------------ */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const storedPanelSchema = z.looseObject({
  id: z.string().min(1),
  type: z.string().min(1),
  v: z.number().int().min(1),
  hidden: z.boolean().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});

function envelopeSchema(contentType: string) {
  return z.object({
    id: z.string().min(1),
    contentType: z.literal(contentType),
    slug: z.string(),
    title: z.string().default(''),
    boxes: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
    panels: z.array(storedPanelSchema).default([]),
  });
}

function toPath(path: readonly PropertyKey[]): IssuePath {
  return path.map((p) => (typeof p === 'symbol' ? String(p) : p));
}

function envelopeIssues(error: z.ZodError): PageIssue[] {
  return error.issues.map((i) => ({ severity: 'error', code: 'invalid-page', path: toPath(i.path), message: i.message }));
}

/* ------------------------------------------------------------------ */
/* Field maps                                                          */
/* ------------------------------------------------------------------ */

/**
 * Validates `input` against a field map one field at a time.
 *
 * - `fallback` (reads): a failing field is replaced by its default, or removed
 *   if it has none. `complete` is false when a required field has no valid value.
 * - `keep` (saves): a failing field keeps the editor's raw value.
 *
 * Keys not in the field map are always kept.
 */
function parseFields(
  fields: FieldMap,
  input: Record<string, unknown>,
  path: IssuePath,
  mode: 'fallback' | 'keep',
  severity: PageIssue['severity'],
  panelId?: string,
): { value: Record<string, unknown>; issues: PageIssue[]; complete: boolean } {
  const value: Record<string, unknown> = { ...input };
  const issues: PageIssue[] = [];
  let complete = true;

  for (const [key, field] of Object.entries(fields)) {
    const schema = field.schema as z.ZodType;
    const result = schema.safeParse(input[key]);
    if (result.success) {
      if (result.data === undefined) delete value[key];
      else value[key] = result.data;
      continue;
    }
    for (const i of result.error.issues) {
      issues.push({ severity, code: 'invalid-field', path: [...path, key, ...toPath(i.path)], message: i.message, panelId });
    }
    if (mode === 'keep') {
      complete = false;
      continue;
    }
    const fallback = schema.safeParse(undefined);
    if (fallback.success) {
      if (fallback.data === undefined) delete value[key];
      else value[key] = fallback.data;
    } else {
      delete value[key];
      complete = false;
    }
  }
  return { value, issues, complete };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export interface ReadOptions {
  status?: PageStatus;
  /** Called once per issue, e.g. to log. Issues are also returned. */
  onIssue?: (issue: PageIssue) => void;
}

/**
 * Turns a stored row into a typed page for rendering. Never throws because of
 * panel or field content; throws `PageShapeError` only if the row isn't a page
 * of this content type.
 */
export function readPage<CT extends AnyContentType>(ct: CT, raw: unknown, opts: ReadOptions = {}): ReadResult<PageOf<CT>> {
  const env = envelopeSchema(ct.name).safeParse(raw);
  if (!env.success) {
    throw new PageShapeError(`Not a valid "${ct.name}" page.`, envelopeIssues(env.error));
  }
  const stored = env.data;
  const issues: PageIssue[] = [];

  const boxes: Record<string, Record<string, unknown>> = {};
  for (const [name, fields] of Object.entries(ct.boxes as BoxMap)) {
    const r = parseFields(fields, stored.boxes[name] ?? {}, ['boxes', name], 'fallback', 'warning');
    issues.push(...r.issues);
    boxes[name] = r.value;
  }

  const defs = new Map<string, AnyPanel>(ct.panels.map((p: AnyPanel) => [p.type, p]));
  const panels: Array<{ id: string; type: string; v: number; hidden: boolean; data: Record<string, unknown> }> = [];

  stored.panels.forEach((p, index) => {
    const path: IssuePath = ['panels', index];
    const def = defs.get(p.type);
    if (!def) {
      issues.push({ severity: 'warning', code: 'unknown-panel', path, panelId: p.id, message: `Unknown panel type "${p.type}"; not rendered.` });
      return;
    }
    let upgraded: StoredPanel;
    try {
      upgraded = upgradePanel(def, p);
    } catch (e) {
      issues.push({ severity: 'warning', code: 'migration-failed', path, panelId: p.id, message: `${errorMessage(e)} Panel not rendered.` });
      return;
    }
    const r = parseFields(def.fields, upgraded.data, [...path, 'data'], 'fallback', 'warning', p.id);
    issues.push(...r.issues);
    if (!r.complete) {
      issues.push({ severity: 'warning', code: 'invalid-panel', path, panelId: p.id, message: 'A required field is missing or invalid; panel not rendered.' });
      return;
    }
    panels.push({ id: p.id, type: p.type, v: upgraded.v, hidden: p.hidden ?? false, data: r.value });
  });

  if (opts.onIssue) issues.forEach(opts.onIssue);

  const page = {
    id: stored.id,
    contentType: stored.contentType,
    slug: stored.slug,
    title: stored.title,
    status: opts.status ?? 'draft',
    boxes,
    panels,
  };
  return { page: page as unknown as PageOf<CT>, issues };
}

/* ------------------------------------------------------------------ */
/* Save                                                                */
/* ------------------------------------------------------------------ */

function validateForSave(ct: AnyContentType, raw: unknown, mode: SaveMode): PrepareResult {
  const env = envelopeSchema(ct.name).safeParse(raw);
  if (!env.success) return { ok: false, issues: envelopeIssues(env.error) };
  const stored = env.data;

  const severity: PageIssue['severity'] = mode === 'publish' ? 'error' : 'warning';
  const issues: PageIssue[] = [];

  if (!SLUG.test(stored.slug)) {
    issues.push({ severity: 'error', code: 'invalid-page', path: ['slug'], message: 'Slug must be lowercase kebab-case (e.g. "about-us").' });
  }
  if (stored.title.trim() === '') {
    issues.push({ severity, code: 'invalid-page', path: ['title'], message: 'Title is required to publish.' });
  }

  const seen = new Set<string>();
  stored.panels.forEach((p, index) => {
    if (seen.has(p.id)) issues.push({ severity: 'error', code: 'duplicate-panel-id', path: ['panels', index, 'id'], panelId: p.id, message: `Duplicate panel id "${p.id}".` });
    seen.add(p.id);
  });

  // Boxes: validate the ones the content type defines; keep any others untouched.
  const boxes: Record<string, Record<string, unknown>> = { ...stored.boxes };
  for (const [name, fields] of Object.entries(ct.boxes as BoxMap)) {
    const r = parseFields(fields, stored.boxes[name] ?? {}, ['boxes', name], 'keep', severity);
    issues.push(...r.issues);
    boxes[name] = r.value;
  }

  // Panels: upgrade and validate known types; keep unknown types exactly as they are.
  const defs = new Map<string, AnyPanel>(ct.panels.map((p: AnyPanel) => [p.type, p]));
  const panels: StoredPanel[] = stored.panels.map((p, index) => {
    const path: IssuePath = ['panels', index];
    const def = defs.get(p.type);
    if (!def) {
      issues.push({ severity: 'warning', code: 'unknown-panel', path, panelId: p.id, message: `Unknown panel type "${p.type}"; kept as is.` });
      return p;
    }
    let upgraded: StoredPanel;
    try {
      upgraded = upgradePanel(def, p);
    } catch (e) {
      issues.push({ severity, code: 'migration-failed', path, panelId: p.id, message: errorMessage(e) });
      return p;
    }
    const r = parseFields(def.fields, upgraded.data, [...path, 'data'], 'keep', severity, p.id);
    issues.push(...r.issues);
    return { ...p, v: upgraded.v, hidden: p.hidden ?? false, data: r.value };
  });

  const page: StoredPage = { id: stored.id, contentType: stored.contentType, slug: stored.slug, title: stored.title, boxes, panels };
  if (issues.some((i) => i.severity === 'error')) return { ok: false, page, issues };
  return { ok: true, page, issues };
}

export interface PrepareOptions {
  mode: SaveMode;
}

/**
 * Validates a page the admin wants to save and returns what to write.
 *
 * `beforeSave` runs only when every known field is valid (always the case for
 * a successful publish, and for complete drafts). It sees a typed page with
 * the known panels only; unknown panels are put back at their original
 * positions afterward, and the hook's result is validated again.
 */
export async function preparePageForSave<CT extends AnyContentType>(ct: CT, raw: unknown, opts: PrepareOptions): Promise<PrepareResult> {
  const first = validateForSave(ct, raw, opts.mode);
  const hook = ct.hooks?.beforeSave;
  if (!first.ok || !first.page || !hook) return first;
  if (first.issues.some((i) => i.code !== 'unknown-panel')) return first;

  const known = new Set(ct.panels.map((p: AnyPanel) => p.type));
  const unknown = first.page.panels.map((p, index) => ({ p, index })).filter(({ p }) => !known.has(p.type));
  const typed = {
    ...first.page,
    status: opts.mode === 'publish' ? 'published' : 'draft',
    panels: first.page.panels.filter((p) => known.has(p.type)),
  } as unknown as PageOf<CT>;

  const result = (await hook(typed)) as unknown as StoredPage & { status?: PageStatus };
  const { status: _status, ...rest } = result;
  const panels = [...rest.panels];
  for (const { p, index } of unknown) panels.splice(Math.min(index, panels.length), 0, p);

  return validateForSave(ct, { ...rest, id: first.page.id, contentType: first.page.contentType, panels }, opts.mode);
}
