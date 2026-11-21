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
  | 'duplicate-panel-id'
  | 'html-sanitized' // disallowed HTML was removed from a rich-text field on save
  | 'svg-cleaned' // scripts, links or other non-drawing parts were removed from an SVG on save
  | 'svg-invalid'; // an SVG field holds something that isn't a usable SVG

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

export interface ReadResult<Page> {
  page: Page;
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
  return path.map((segment) => (typeof segment === 'symbol' ? String(segment) : segment));
}

function envelopeIssues(error: z.ZodError): PageIssue[] {
  return error.issues.map((issue) => ({ severity: 'error', code: 'invalid-page', path: toPath(issue.path), message: issue.message }));
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
    for (const issue of result.error.issues) {
      issues.push({ severity, code: 'invalid-field', path: [...path, key, ...toPath(issue.path)], message: issue.message, panelId });
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
export function readPage<Type extends AnyContentType>(contentType: Type, raw: unknown, options: ReadOptions = {}): ReadResult<PageOf<Type>> {
  const envelope = envelopeSchema(contentType.name).safeParse(raw);
  if (!envelope.success) {
    throw new PageShapeError(`Not a valid "${contentType.name}" page.`, envelopeIssues(envelope.error));
  }
  const stored = envelope.data;
  const issues: PageIssue[] = [];

  const boxes: Record<string, Record<string, unknown>> = {};
  for (const [name, fields] of Object.entries(contentType.boxes as BoxMap)) {
    const parsed = parseFields(fields, stored.boxes[name] ?? {}, ['boxes', name], 'fallback', 'warning');
    issues.push(...parsed.issues);
    boxes[name] = parsed.value;
  }

  const definitions = new Map<string, AnyPanel>(contentType.panels.map((definition: AnyPanel) => [definition.type, definition]));
  const panels: Array<{ id: string; type: string; v: number; hidden: boolean; data: Record<string, unknown> }> = [];

  stored.panels.forEach((storedPanel, index) => {
    const path: IssuePath = ['panels', index];
    const definition = definitions.get(storedPanel.type);
    if (!definition) {
      issues.push({ severity: 'warning', code: 'unknown-panel', path, panelId: storedPanel.id, message: `Unknown panel type "${storedPanel.type}"; not rendered.` });
      return;
    }
    let upgraded: StoredPanel;
    try {
      upgraded = upgradePanel(definition, storedPanel);
    } catch (error) {
      issues.push({ severity: 'warning', code: 'migration-failed', path, panelId: storedPanel.id, message: `${errorMessage(error)} Panel not rendered.` });
      return;
    }
    const parsed = parseFields(definition.fields, upgraded.data, [...path, 'data'], 'fallback', 'warning', storedPanel.id);
    issues.push(...parsed.issues);
    if (!parsed.complete) {
      issues.push({ severity: 'warning', code: 'invalid-panel', path, panelId: storedPanel.id, message: 'A required field is missing or invalid; panel not rendered.' });
      return;
    }
    panels.push({ id: storedPanel.id, type: storedPanel.type, v: upgraded.v, hidden: storedPanel.hidden ?? false, data: parsed.value });
  });

  if (options.onIssue) issues.forEach(options.onIssue);

  const page = {
    id: stored.id,
    contentType: stored.contentType,
    slug: stored.slug,
    title: stored.title,
    status: options.status ?? 'draft',
    boxes,
    panels,
  };
  return { page: page as unknown as PageOf<Type>, issues };
}

/* ------------------------------------------------------------------ */
/* Save                                                                */
/* ------------------------------------------------------------------ */

function validateForSave(contentType: AnyContentType, raw: unknown, mode: SaveMode): PrepareResult {
  const envelope = envelopeSchema(contentType.name).safeParse(raw);
  if (!envelope.success) return { ok: false, issues: envelopeIssues(envelope.error) };
  const stored = envelope.data;

  const severity: PageIssue['severity'] = mode === 'publish' ? 'error' : 'warning';
  const issues: PageIssue[] = [];

  if (!SLUG.test(stored.slug)) {
    issues.push({ severity: 'error', code: 'invalid-page', path: ['slug'], message: 'Slug must be lowercase kebab-case (e.g. "about-us").' });
  }
  if (stored.title.trim() === '') {
    issues.push({ severity, code: 'invalid-page', path: ['title'], message: 'Title is required to publish.' });
  }

  const seen = new Set<string>();
  stored.panels.forEach((storedPanel, index) => {
    if (seen.has(storedPanel.id)) issues.push({ severity: 'error', code: 'duplicate-panel-id', path: ['panels', index, 'id'], panelId: storedPanel.id, message: `Duplicate panel id "${storedPanel.id}".` });
    seen.add(storedPanel.id);
  });

  // Boxes: validate the ones the content type defines; keep any others untouched.
  const boxes: Record<string, Record<string, unknown>> = { ...stored.boxes };
  for (const [name, fields] of Object.entries(contentType.boxes as BoxMap)) {
    const parsed = parseFields(fields, stored.boxes[name] ?? {}, ['boxes', name], 'keep', severity);
    issues.push(...parsed.issues);
    boxes[name] = parsed.value;
  }

  // Panels: upgrade and validate known types; keep unknown types exactly as they are.
  const definitions = new Map<string, AnyPanel>(contentType.panels.map((definition: AnyPanel) => [definition.type, definition]));
  const panels: StoredPanel[] = stored.panels.map((storedPanel, index) => {
    const path: IssuePath = ['panels', index];
    const definition = definitions.get(storedPanel.type);
    if (!definition) {
      issues.push({ severity: 'warning', code: 'unknown-panel', path, panelId: storedPanel.id, message: `Unknown panel type "${storedPanel.type}"; kept as is.` });
      return storedPanel;
    }
    let upgraded: StoredPanel;
    try {
      upgraded = upgradePanel(definition, storedPanel);
    } catch (error) {
      issues.push({ severity, code: 'migration-failed', path, panelId: storedPanel.id, message: errorMessage(error) });
      return storedPanel;
    }
    const parsed = parseFields(definition.fields, upgraded.data, [...path, 'data'], 'keep', severity, storedPanel.id);
    issues.push(...parsed.issues);
    return { ...storedPanel, v: upgraded.v, hidden: storedPanel.hidden ?? false, data: parsed.value };
  });

  const page: StoredPage = { id: stored.id, contentType: stored.contentType, slug: stored.slug, title: stored.title, boxes, panels };
  if (issues.some((issue) => issue.severity === 'error')) return { ok: false, page, issues };
  return { ok: true, page, issues };
}

export interface PrepareOptions {
  mode: SaveMode;
}

/* ------------------------------------------------------------------ */
/* Rich-text sanitizing                                                */
/* ------------------------------------------------------------------ */

/**
 * Sanitizes every `field.html()` value in the known boxes and panels (repeaters
 * included), reporting a warning wherever something was removed. Unknown
 * panels and keys are left alone: they aren't rendered.
 */
async function sanitizePage(contentType: AnyContentType, page: StoredPage): Promise<{ page: StoredPage; issues: PageIssue[] }> {
  // Lazy: keeps the sanitizers out of client bundles that only import field definitions.
  const { sanitizeRichTextWithReport } = await import('./sanitize.ts');
  const { cleanSvg } = await import('./svg.ts');
  const issues: PageIssue[] = [];

  const clean = (fields: FieldMap, value: unknown, path: IssuePath, panelId?: string): unknown => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [key, field] of Object.entries(fields)) {
      const fieldValue = out[key];
      if (field.kind === 'html' && typeof fieldValue === 'string') {
        const toolbar = (field.config as { toolbar?: 'full' | 'limited' } | undefined)?.toolbar ?? 'full';
        const sanitized = sanitizeRichTextWithReport(fieldValue, toolbar);
        out[key] = sanitized.html;
        if (sanitized.removed) {
          issues.push({
            severity: 'warning',
            code: 'html-sanitized',
            path: [...path, key],
            panelId,
            message:
              toolbar === 'limited'
                ? 'Formatting this field doesn’t allow was removed. It takes bold, italic, underline, strikethrough, lists, links and quotes.'
                : 'HTML that isn’t allowed (scripts, inline styles, unsafe links) was removed.',
          });
        }
      } else if (field.kind === 'svg' && typeof fieldValue === 'string' && fieldValue !== '') {
        const cleaned = cleanSvg(fieldValue);
        if ('error' in cleaned) {
          out[key] = undefined;
          issues.push({ severity: 'error', code: 'svg-invalid', path: [...path, key], panelId, message: `${cleaned.error} Upload another file.` });
        } else {
          out[key] = cleaned.svg;
          if (cleaned.removed) {
            issues.push({
              severity: 'warning',
              code: 'svg-cleaned',
              path: [...path, key],
              panelId,
              message: 'Parts of the SVG that aren’t drawing (scripts, links, embedded files or styles) were removed.',
            });
          }
        }
      } else if (field.kind === 'repeater' && Array.isArray(fieldValue)) {
        const itemFields = (field.config as { fields: FieldMap }).fields;
        out[key] = fieldValue.map((item, i) => clean(itemFields, item, [...path, key, i], panelId));
      }
    }
    return out;
  };

  const boxes = { ...page.boxes };
  for (const [name, fields] of Object.entries(contentType.boxes as BoxMap)) {
    if (boxes[name]) boxes[name] = clean(fields, boxes[name], ['boxes', name]) as Record<string, unknown>;
  }
  const definitions = new Map<string, AnyPanel>(contentType.panels.map((definition: AnyPanel) => [definition.type, definition]));
  const panels = page.panels.map((storedPanel, index) => {
    const definition = definitions.get(storedPanel.type);
    // Only panels at the current version: a panel whose migration failed may not match the fields.
    if (!definition || storedPanel.v !== definition.version) return storedPanel;
    return { ...storedPanel, data: clean(definition.fields, storedPanel.data, ['panels', index, 'data'], storedPanel.id) as Record<string, unknown> };
  });
  return { page: { ...page, boxes, panels }, issues };
}

/** Issues that don't stop `beforeSave` from running: notes about what saving cleaned up. */
const CLEANING_NOTES = new Set<IssueCode>(['unknown-panel', 'html-sanitized', 'svg-cleaned']);

/** validateForSave, then sanitize the rich text and SVGs in what it returns. */
async function validateAndSanitize(contentType: AnyContentType, raw: unknown, mode: SaveMode): Promise<PrepareResult> {
  const result = validateForSave(contentType, raw, mode);
  if (!result.page) return result;
  const cleaned = await sanitizePage(contentType, result.page);
  const issues = [...result.issues, ...cleaned.issues];
  const ok = result.ok && !cleaned.issues.some((issue) => issue.severity === 'error');
  return ok ? { ok: true, page: cleaned.page, issues } : { ok: false, page: cleaned.page, issues };
}

/**
 * Validates a page the admin wants to save and returns what to write.
 * Rich-text (`field.html()`) values are sanitized; anything removed is reported
 * as an `html-sanitized` warning, which doesn't block saving or publishing.
 *
 * `beforeSave` runs only when every known field is valid (always the case for
 * a successful publish, and for complete drafts). It sees a typed page with
 * the known panels only; unknown panels are put back at their original
 * positions afterward, and the hook's result is validated again.
 */
export async function preparePageForSave<Type extends AnyContentType>(contentType: Type, raw: unknown, options: PrepareOptions): Promise<PrepareResult> {
  const first = await validateAndSanitize(contentType, raw, options.mode);
  const hook = contentType.hooks?.beforeSave;
  if (!first.ok || !first.page || !hook) return first;
  if (first.issues.some((issue) => !CLEANING_NOTES.has(issue.code))) return first;

  const known = new Set(contentType.panels.map((definition: AnyPanel) => definition.type));
  const unknown = first.page.panels.map((panel, index) => ({ panel, index })).filter(({ panel }) => !known.has(panel.type));
  const typed = {
    ...first.page,
    status: options.mode === 'publish' ? 'published' : 'draft',
    panels: first.page.panels.filter((panel) => known.has(panel.type)),
  } as unknown as PageOf<Type>;

  const result = (await hook(typed)) as unknown as StoredPage & { status?: PageStatus };
  const { status: _status, ...rest } = result;
  const panels = [...rest.panels];
  for (const { panel, index } of unknown) panels.splice(Math.min(index, panels.length), 0, panel);

  // Validate and sanitize again: the hook may have changed anything. The second
  // pass sees HTML that is already clean, so carry over the first pass's
  // sanitize warnings for the editor.
  const second = await validateAndSanitize(contentType, { ...rest, id: first.page.id, contentType: first.page.contentType, panels }, options.mode);
  const seen = new Set(second.issues.map((issue) => `${issue.code}:${issue.path.join('.')}`));
  const carried = first.issues.filter((issue) => issue.code !== 'unknown-panel' && CLEANING_NOTES.has(issue.code) && !seen.has(`${issue.code}:${issue.path.join('.')}`));
  const issues = [...second.issues, ...carried];
  return second.ok ? { ok: true, page: second.page, issues } : { ok: false, page: second.page, issues };
}
