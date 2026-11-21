/**
 * Field builder — the TypeScript successor to the theme's
 * `[ 'Label' => 'field_type' ]` arrays in DO_Custom_Post_Type::meta_fields().
 *
 * Every builder returns a `Field`: a runtime Zod schema (validation + defaults)
 * plus metadata the admin UI uses to pick a widget (`kind`, `meta`, `config`).
 * Value types are inferred from the Zod schema, so a panel's component props
 * come straight from its field map — no hand-written `getBlocksPanelConfig()`.
 */
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Core types                                                          */
/* ------------------------------------------------------------------ */

export interface FieldMeta {
  /** Admin label. Keys are stable identifiers; labels are display only. */
  label?: string;
  /** Editor help text. Replaces the theme's `settings()['notes']`. */
  note?: string;
  /** Soft limit shown as a live counter. Replaces `settings()['character_count']`. Not enforced. */
  maxLength?: number;
}

export interface BaseOptions<T> extends FieldMeta {
  required?: boolean;
  default?: T;
}

/**
 * `S` is the field's Zod schema. It is deliberately unconstrained: builders
 * pick `ZodOptional<…>` / `ZodDefault<…>` from the options at the type level,
 * and those deferred conditional types don't satisfy Zod's own constraints
 * until instantiated. Value types are read via `ValueOf`.
 */
export interface Field<Kind extends string = string, S = z.ZodType, Config = unknown> {
  readonly kind: Kind;
  readonly meta: FieldMeta;
  readonly config: Config;
  readonly schema: S;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyField = Field<string, any, any>;
export type FieldMap = Record<string, AnyField>;

/** Stored (post-parse) value type of a Zod schema. */
export type ValueOf<S> = S extends { _zod: { output: infer T } } ? T : never;
export type InferField<F extends AnyField> = ValueOf<F['schema']>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** Stored value shape for a field map: keys whose value can be `undefined` become optional. */
export type InferFields<M extends FieldMap> = Simplify<
  { [K in keyof M as undefined extends InferField<M[K]> ? never : K]: InferField<M[K]> } & {
    [K in keyof M as undefined extends InferField<M[K]> ? K : never]?: InferField<M[K]>;
  }
>;

/**
 * Optional by default. `required: true` → non-optional.
 * `default` → non-optional in the stored output (Zod fills it in on parse).
 */
export type Finalize<S extends z.ZodType, O> =
  O extends { default: unknown } ? z.ZodDefault<S>
  : O extends { required: true } ? S
  : z.ZodOptional<S>;

function finalize<S extends z.ZodType, O extends BaseOptions<unknown>>(schema: S, opts: O): Finalize<S, O> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (opts.default !== undefined) return (schema as any).default(opts.default);
  if (opts.required) return schema as unknown as Finalize<S, O>;
  return schema.optional() as unknown as Finalize<S, O>;
}

function metaOf(o: FieldMeta): FieldMeta {
  return { label: o.label, note: o.note, maxLength: o.maxLength };
}

function field<K extends string, S, C = undefined>(
  kind: K,
  schema: S,
  opts: FieldMeta,
  config?: C,
): Field<K, S, C> {
  return { kind, schema, meta: metaOf(opts), config: config as C };
}

/** Runtime: field map → Zod object shape. */
export function shapeOf(fields: FieldMap): Record<string, z.ZodType> {
  return Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.schema as z.ZodType]));
}

/**
 * Runtime: field map → Zod object schema, typed by the inferred stored value.
 *
 * The object is *loose*: keys the definition doesn't know are kept, not
 * stripped. Stored data can contain keys from a newer deploy or from a field
 * that was removed without a migration; a load → save round trip must not
 * delete them. The static type stays exact; extra keys are runtime-only.
 */
export function objectSchema<M extends FieldMap>(fields: M): z.ZodType<InferFields<M>> {
  return z.looseObject(shapeOf(fields)) as unknown as z.ZodType<InferFields<M>>;
}

/* ------------------------------------------------------------------ */
/* Shared value schemas                                                */
/* ------------------------------------------------------------------ */

/**
 * Reference to a row in the `media` table (Supabase Storage object).
 * Theme note on Media: "Supports images or Vimeo videos."
 */
export const mediaRef = z.object({
  id: z.string(),
  path: z.string(),
  kind: z.enum(['image', 'video', 'embed']).default('image'),
  alt: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});
export type MediaRef = z.output<typeof mediaRef>;

/** TODO(verify): match the theme's `background` field (image or .mp4 video, color, overlay?). */
export const background = z.object({
  media: mediaRef.optional(),
  color: z.string().optional(),
  overlay: z.boolean().default(false),
});
export type Background = z.output<typeof background>;

/** Theme note on CTA: "For internal links, only include the path" — so URLs are not validated as absolute. */
export const cta = z.object({
  text: z.string(),
  url: z.string(),
  target: z.enum(['_self', '_blank', 'modal']).default('_self'),
  style: z.string().optional(),
});
export type CTA = z.output<typeof cta>;

export interface Option { label: string; value: string }

/** Context passed to dynamic option sources (replaces callbacks like devo_get_public_post_types). */
export interface OptionsContext {
  contentTypes: { name: string; label: string; public: boolean }[];
  // TODO: add a typed DB/query handle once the Supabase layer exists.
}
export type OptionsSource = (ctx: OptionsContext) => Option[] | Promise<Option[]>;

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

type StrOpts = BaseOptions<string>;

/** Longest `f.svg()` value, in characters. */
export const MAX_SVG_LENGTH = 100_000;

export const f = {
  /** Single-line text (theme: `text`, `varchar`). */
  text: <const O extends StrOpts = {}>(opts: O = {} as O) =>
    field<'text', Finalize<z.ZodString, O>>('text', finalize(z.string(), opts), opts),

  /** Multi-line plain text (theme: `textarea`). */
  textarea: <const O extends StrOpts = {}>(opts: O = {} as O) =>
    field<'textarea', Finalize<z.ZodString, O>>('textarea', finalize(z.string(), opts), opts),

  /** Rich text stored as sanitized HTML (theme: `html`, `wp_editor`, `wp_editor_limited`). */
  html: <const O extends StrOpts & { toolbar?: 'full' | 'limited' } = {}>(opts: O = {} as O) =>
    field<'html', Finalize<z.ZodString, O>, { toolbar: 'full' | 'limited' }>('html', finalize(z.string(), opts), opts, { toolbar: opts.toolbar ?? 'full' }),

  /** URL or internal path (theme: `url`). */
  url: <const O extends StrOpts = {}>(opts: O = {} as O) =>
    field<'url', Finalize<z.ZodString, O>>('url', finalize(z.string(), opts), opts),

  /** Icon key from the icon library (theme: `icon`, devo_icon post type). */
  icon: <const O extends StrOpts = {}>(opts: O = {} as O) =>
    field<'icon', Finalize<z.ZodString, O>>('icon', finalize(z.string(), opts), opts),

  /**
   * An SVG drawing (custom icons; theme: the icon post type's File). Cleaned
   * on save to shapes only, with black turned into currentColor (svg.ts).
   */
  svg: <const O extends StrOpts = {}>(opts: O = {} as O) =>
    field<'svg', Finalize<z.ZodString, O>>('svg', finalize(z.string().max(MAX_SVG_LENGTH), opts), opts),

  /** Boolean, always present, defaults to false (theme: `binary`). */
  toggle: (opts: FieldMeta & { default?: boolean } = {}) =>
    field('toggle', z.boolean().default(opts.default ?? false), opts),

  /** Number (theme: `int`). */
  number: <const O extends BaseOptions<number> & { min?: number; max?: number; int?: boolean } = {}>(opts: O = {} as O) => {
    let s = z.number();
    if (opts.int) s = s.int();
    if (opts.min !== undefined) s = s.min(opts.min);
    if (opts.max !== undefined) s = s.max(opts.max);
    return field<'number', Finalize<z.ZodNumber, O>, { min?: number; max?: number }>('number', finalize(s, opts), opts, { min: opts.min, max: opts.max });
  },

  /** Items per row in a grid (theme: `per_row`). Theme note: "Default is 3." */
  perRow: (opts: FieldMeta & { default?: number; max?: number } = {}) =>
    field('perRow', z.number().int().min(1).max(opts.max ?? 6).default(opts.default ?? 3), opts, { max: opts.max ?? 6 }),

  /**
   * Select with static options. Value type is the union of option keys.
   *   f.select({ options: { card: 'Card (default)', plain: 'Plain' }, default: 'card' })
   */
  select: <const O extends BaseOptions<string> & { options: Record<string, string> }>(opts: O) => {
    const keys = Object.keys(opts.options) as [string, ...string[]];
    const schema = z.enum(keys) as unknown as z.ZodType<keyof O['options'] & string>;
    return field<'select', Finalize<typeof schema, O>, { options: O['options'] }>('select', finalize(schema, opts), opts, { options: opts.options });
  },

  /**
   * Select whose options are resolved at edit time (theme: `select` / `select_multiple`
   * with a callback like 'devo_get_public_post_types'). Value is not narrowed at the type level.
   */
  selectFrom: <const O extends FieldMeta & { options: OptionsSource; multiple?: boolean }>(opts: O) => {
    const schema = (opts.multiple ? z.array(z.string()).default([]) : z.string().optional()) as unknown as
      O extends { multiple: true } ? z.ZodDefault<z.ZodArray<z.ZodString>> : z.ZodOptional<z.ZodString>;
    return field<'selectFrom', typeof schema, { options: OptionsSource; multiple: boolean }>('selectFrom', schema, opts, { options: opts.options, multiple: !!opts.multiple });
  },

  /** Single media item (theme: `media`). */
  media: <const O extends BaseOptions<MediaRef> & { accept?: Array<'image' | 'video' | 'embed'> } = {}>(opts: O = {} as O) =>
    field<'media', Finalize<typeof mediaRef, O>, { accept: Array<'image' | 'video' | 'embed'> }>('media', finalize(mediaRef, opts), opts, { accept: opts.accept ?? ['image', 'video', 'embed'] }),

  /** Ordered list of media (theme: `gallery`). */
  gallery: (opts: FieldMeta & { limit?: number } = {}) => {
    let s = z.array(mediaRef);
    if (opts.limit) s = s.max(opts.limit);
    return field('gallery', s.default([]), opts, { limit: opts.limit });
  },

  /** Section background (theme: `background`). */
  background: (opts: FieldMeta = {}) =>
    field('background', background.default({ overlay: false }), opts),

  /** One call to action (theme: `cta`). */
  cta: <const O extends BaseOptions<CTA> = {}>(opts: O = {} as O) =>
    field<'cta', Finalize<typeof cta, O>>('cta', finalize(cta, opts), opts),

  /** List of calls to action (theme: `ctas`). */
  ctas: (opts: FieldMeta & { limit?: number } = {}) => {
    let s = z.array(cta);
    if (opts.limit) s = s.max(opts.limit);
    return field('ctas', s.default([]), opts, { limit: opts.limit });
  },

  /**
   * Repeating group (theme: `multi_array`). Items get a stable `_id`
   * so the admin can reorder/key them without index-based keys.
   */
  repeater: <const M extends FieldMap>(opts: FieldMeta & { fields: M; limit?: number; min?: number; itemTitle?: keyof M & string }) => {
    // Loose for the same reason as objectSchema: unknown keys survive a save.
    const item = z.looseObject({ _id: z.string(), ...shapeOf(opts.fields) });
    let s = z.array(item);
    if (opts.limit) s = s.max(opts.limit);
    if (opts.min) s = s.min(opts.min);
    type Item = { _id: string } & InferFields<M>;
    return field<'repeater', z.ZodDefault<z.ZodType<Item[]>>, { fields: M; limit?: number; min?: number; itemTitle?: keyof M & string }>('repeater', s.default([]) as never, opts, {
      fields: opts.fields,
      limit: opts.limit,
      min: opts.min,
      itemTitle: opts.itemTitle,
    });
  },

  /**
   * References to other documents by id (theme: `post_browser`).
   * `to` is a fixed list of content types, or `{ field }` to read the allowed
   * types from a sibling field at edit time (theme: settings.post_types_field).
   * Always an array; `limit: 1` for a single pick.
   */
  relation: (opts: FieldMeta & { to: string[] | { field: string }; limit?: number }) => {
    let s = z.array(z.string());
    if (opts.limit) s = s.max(opts.limit);
    return field('relation', s.default([]), opts, { to: opts.to, limit: opts.limit });
  },
} as const;

/**
 * Stats list (theme: `stats`). Theme note: "Number Field: can ONLY be a number."
 * TODO(verify): confirm sub-fields against the theme's stats field definition.
 */
export const stats = (opts: FieldMeta = {}) =>
  f.repeater({
    ...opts,
    itemTitle: 'label',
    fields: {
      number: f.number({ required: true }),
      prefix: f.text(),
      suffix: f.text(),
      label: f.text({ required: true }),
    },
  });

/** Escape hatch for one-off field kinds (theme: `*_callback` field types). */
export function custom<K extends string, S extends z.ZodType, C = undefined>(
  kind: K,
  schema: S,
  opts: FieldMeta = {},
  config?: C,
): Field<K, S, C> {
  return field(kind, schema, opts, config);
}
