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

export interface BaseOptions<Value> extends FieldMeta {
  required?: boolean;
  default?: Value;
}

/**
 * `Schema` is the field's Zod schema. It is deliberately unconstrained: builders
 * pick `ZodOptional<…>` / `ZodDefault<…>` from the options at the type level,
 * and those deferred conditional types don't satisfy Zod's own constraints
 * until instantiated. Value types are read via `ValueOf`.
 */
export interface Field<Kind extends string = string, Schema = z.ZodType, Config = unknown> {
  readonly kind: Kind;
  readonly meta: FieldMeta;
  readonly config: Config;
  readonly schema: Schema;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyField = Field<string, any, any>;
export type FieldMap = Record<string, AnyField>;

/** Stored (post-parse) value type of a Zod schema. */
export type ValueOf<Schema> = Schema extends { _zod: { output: infer Output } } ? Output : never;
export type InferField<Definition extends AnyField> = ValueOf<Definition['schema']>;

type Simplify<Shape> = { [Key in keyof Shape]: Shape[Key] } & {};

/** Stored value shape for a field map: keys whose value can be `undefined` become optional. */
export type InferFields<Fields extends FieldMap> = Simplify<
  { [Key in keyof Fields as undefined extends InferField<Fields[Key]> ? never : Key]: InferField<Fields[Key]> } & {
    [Key in keyof Fields as undefined extends InferField<Fields[Key]> ? Key : never]?: InferField<Fields[Key]>;
  }
>;

/**
 * Optional by default. `required: true` → non-optional.
 * `default` → non-optional in the stored output (Zod fills it in on parse).
 */
export type Finalize<Schema extends z.ZodType, Options> =
  Options extends { default: unknown } ? z.ZodDefault<Schema>
  : Options extends { required: true } ? Schema
  : z.ZodOptional<Schema>;

function finalize<Schema extends z.ZodType, Options extends BaseOptions<unknown>>(schema: Schema, options: Options): Finalize<Schema, Options> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (options.default !== undefined) return (schema as any).default(options.default);
  if (options.required) return schema as unknown as Finalize<Schema, Options>;
  return schema.optional() as unknown as Finalize<Schema, Options>;
}

function metaOf(meta: FieldMeta): FieldMeta {
  return { label: meta.label, note: meta.note, maxLength: meta.maxLength };
}

function buildField<Kind extends string, Schema, Config = undefined>(
  kind: Kind,
  schema: Schema,
  options: FieldMeta,
  config?: Config,
): Field<Kind, Schema, Config> {
  return { kind, schema, meta: metaOf(options), config: config as Config };
}

/** Runtime: field map → Zod object shape. */
export function shapeOf(fields: FieldMap): Record<string, z.ZodType> {
  return Object.fromEntries(Object.entries(fields).map(([key, definition]) => [key, definition.schema as z.ZodType]));
}

/**
 * Runtime: field map → Zod object schema, typed by the inferred stored value.
 *
 * The object is *loose*: keys the definition doesn't know are kept, not
 * stripped. Stored data can contain keys from a newer deploy or from a field
 * that was removed without a migration; a load → save round trip must not
 * delete them. The static type stays exact; extra keys are runtime-only.
 */
export function objectSchema<Fields extends FieldMap>(fields: Fields): z.ZodType<InferFields<Fields>> {
  return z.looseObject(shapeOf(fields)) as unknown as z.ZodType<InferFields<Fields>>;
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

/** TODO(verify): match the theme's `background` buildField (image or .mp4 video, color, overlay?). */
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
export type OptionsSource = (context: OptionsContext) => Option[] | Promise<Option[]>;

/* ------------------------------------------------------------------ */
/* Builders                                                            */
/* ------------------------------------------------------------------ */

type StrOpts = BaseOptions<string>;

/** Longest `field.svg()` value, in characters. */
export const MAX_SVG_LENGTH = 100_000;

export const field = {
  /** Single-line text (theme: `text`, `varchar`). */
  text: <const Options extends StrOpts = {}>(options: Options = {} as Options) =>
    buildField<'text', Finalize<z.ZodString, Options>>('text', finalize(z.string(), options), options),

  /** Multi-line plain text (theme: `textarea`). */
  textarea: <const Options extends StrOpts = {}>(options: Options = {} as Options) =>
    buildField<'textarea', Finalize<z.ZodString, Options>>('textarea', finalize(z.string(), options), options),

  /** Rich text stored as sanitized HTML (theme: `html`, `wp_editor`, `wp_editor_limited`). */
  html: <const Options extends StrOpts & { toolbar?: 'full' | 'limited' } = {}>(options: Options = {} as Options) =>
    buildField<'html', Finalize<z.ZodString, Options>, { toolbar: 'full' | 'limited' }>('html', finalize(z.string(), options), options, { toolbar: options.toolbar ?? 'full' }),

  /** URL or internal path (theme: `url`). */
  url: <const Options extends StrOpts = {}>(options: Options = {} as Options) =>
    buildField<'url', Finalize<z.ZodString, Options>>('url', finalize(z.string(), options), options),

  /** Icon key from the icon library (theme: `icon`, devo_icon post type). */
  icon: <const Options extends StrOpts = {}>(options: Options = {} as Options) =>
    buildField<'icon', Finalize<z.ZodString, Options>>('icon', finalize(z.string(), options), options),

  /**
   * An SVG drawing (custom icons; theme: the icon post type's File). Cleaned
   * on save to shapes only, with black turned into currentColor (svg.ts).
   */
  svg: <const Options extends StrOpts = {}>(options: Options = {} as Options) =>
    buildField<'svg', Finalize<z.ZodString, Options>>('svg', finalize(z.string().max(MAX_SVG_LENGTH), options), options),

  /** Boolean, always present, defaults to false (theme: `binary`). */
  toggle: (options: FieldMeta & { default?: boolean } = {}) =>
    buildField('toggle', z.boolean().default(options.default ?? false), options),

  /** Number (theme: `int`). */
  number: <const Options extends BaseOptions<number> & { min?: number; max?: number; int?: boolean } = {}>(options: Options = {} as Options) => {
    let schema = z.number();
    if (options.int) schema = schema.int();
    if (options.min !== undefined) schema = schema.min(options.min);
    if (options.max !== undefined) schema = schema.max(options.max);
    return buildField<'number', Finalize<z.ZodNumber, Options>, { min?: number; max?: number }>('number', finalize(schema, options), options, { min: options.min, max: options.max });
  },

  /** Items per row in a grid (theme: `per_row`). Theme note: "Default is 3." */
  perRow: (options: FieldMeta & { default?: number; max?: number } = {}) =>
    buildField('perRow', z.number().int().min(1).max(options.max ?? 6).default(options.default ?? 3), options, { max: options.max ?? 6 }),

  /**
   * Select with static options. Value type is the union of option keys.
   *   field.select({ options: { card: 'Card (default)', plain: 'Plain' }, default: 'card' })
   */
  select: <const Options extends BaseOptions<string> & { options: Record<string, string> }>(options: Options) => {
    const keys = Object.keys(options.options) as [string, ...string[]];
    const schema = z.enum(keys) as unknown as z.ZodType<keyof Options['options'] & string>;
    return buildField<'select', Finalize<typeof schema, Options>, { options: Options['options'] }>('select', finalize(schema, options), options, { options: options.options });
  },

  /**
   * Select whose options are resolved at edit time (theme: `select` / `select_multiple`
   * with a callback like 'devo_get_public_post_types'). Value is not narrowed at the type level.
   */
  selectFrom: <const Options extends FieldMeta & { options: OptionsSource; multiple?: boolean }>(options: Options) => {
    const schema = (options.multiple ? z.array(z.string()).default([]) : z.string().optional()) as unknown as
      Options extends { multiple: true } ? z.ZodDefault<z.ZodArray<z.ZodString>> : z.ZodOptional<z.ZodString>;
    return buildField<'selectFrom', typeof schema, { options: OptionsSource; multiple: boolean }>('selectFrom', schema, options, { options: options.options, multiple: !!options.multiple });
  },

  /** Single media item (theme: `media`). */
  media: <const Options extends BaseOptions<MediaRef> & { accept?: Array<'image' | 'video' | 'embed'> } = {}>(options: Options = {} as Options) =>
    buildField<'media', Finalize<typeof mediaRef, Options>, { accept: Array<'image' | 'video' | 'embed'> }>('media', finalize(mediaRef, options), options, { accept: options.accept ?? ['image', 'video', 'embed'] }),

  /** Ordered list of media (theme: `gallery`). */
  gallery: (options: FieldMeta & { limit?: number } = {}) => {
    let schema = z.array(mediaRef);
    if (options.limit) schema = schema.max(options.limit);
    return buildField('gallery', schema.default([]), options, { limit: options.limit });
  },

  /** Section background (theme: `background`). */
  background: (options: FieldMeta = {}) =>
    buildField('background', background.default({ overlay: false }), options),

  /** One call to action (theme: `cta`). */
  cta: <const Options extends BaseOptions<CTA> = {}>(options: Options = {} as Options) =>
    buildField<'cta', Finalize<typeof cta, Options>>('cta', finalize(cta, options), options),

  /** List of calls to action (theme: `ctas`). */
  ctas: (options: FieldMeta & { limit?: number } = {}) => {
    let schema = z.array(cta);
    if (options.limit) schema = schema.max(options.limit);
    return buildField('ctas', schema.default([]), options, { limit: options.limit });
  },

  /**
   * Repeating group (theme: `multi_array`). Items get a stable `_id`
   * so the admin can reorder/key them without index-based keys.
   */
  repeater: <const Fields extends FieldMap>(options: FieldMeta & { fields: Fields; limit?: number; min?: number; itemTitle?: keyof Fields & string }) => {
    // Loose for the same reason as objectSchema: unknown keys survive a save.
    const item = z.looseObject({ _id: z.string(), ...shapeOf(options.fields) });
    let schema = z.array(item);
    if (options.limit) schema = schema.max(options.limit);
    if (options.min) schema = schema.min(options.min);
    type Item = { _id: string } & InferFields<Fields>;
    return buildField<'repeater', z.ZodDefault<z.ZodType<Item[]>>, { fields: Fields; limit?: number; min?: number; itemTitle?: keyof Fields & string }>('repeater', schema.default([]) as never, options, {
      fields: options.fields,
      limit: options.limit,
      min: options.min,
      itemTitle: options.itemTitle,
    });
  },

  /**
   * References to other documents by id (theme: `post_browser`).
   * `to` is a fixed list of content types, or `{ field }` to read the allowed
   * types from a sibling field at edit time (theme: settings.post_types_field).
   * Always an array; `limit: 1` for a single pick.
   */
  relation: (options: FieldMeta & { to: string[] | { field: string }; limit?: number }) => {
    let schema = z.array(z.string());
    if (options.limit) schema = schema.max(options.limit);
    return buildField('relation', schema.default([]), options, { to: options.to, limit: options.limit });
  },
} as const;

/**
 * Stats list (theme: `stats`). Theme note: "Number Field: can ONLY be a number."
 * TODO(verify): confirm sub-fields against the theme's stats field definition.
 */
export const stats = (options: FieldMeta = {}) =>
  field.repeater({
    ...options,
    itemTitle: 'label',
    fields: {
      number: field.number({ required: true }),
      prefix: field.text(),
      suffix: field.text(),
      label: field.text({ required: true }),
    },
  });

/** Escape hatch for one-off field kinds (theme: `*_callback` field types). */
export function custom<Kind extends string, Schema extends z.ZodType, Config = undefined>(
  kind: Kind,
  schema: Schema,
  options: FieldMeta = {},
  config?: Config,
): Field<Kind, Schema, Config> {
  return buildField(kind, schema, options, config);
}
