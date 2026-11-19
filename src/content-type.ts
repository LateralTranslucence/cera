/**
 * Content types — the successor to DO_Custom_Post_Type subclasses
 * (post_type(), settings(), meta_fields()).
 *
 * `boxes`  = fixed field groups (theme: Hero / SEO / Admin meta boxes)
 * `panels` = the panel types editors can add (theme: the dynamic "Panel" box)
 */
import { z } from 'zod';
import { type FieldMap, type InferFields, type MediaRef, objectSchema } from './fields.ts';
import type { AnyPanel, PanelUnion } from './panel.ts';

export type BoxMap = Record<string, FieldMap>;

export type PageStatus = 'draft' | 'published';

export interface PageDocument<N extends string, B extends BoxMap, P extends readonly AnyPanel[]> {
  id: string;
  contentType: N;
  slug: string;
  title: string;
  status: PageStatus;
  boxes: { [K in keyof B]: InferFields<B[K]> };
  panels: PanelUnion<P>[];
}

export interface ContentTypeConfig<N extends string, B extends BoxMap, P extends readonly AnyPanel[]> {
  name: N;
  label: string;
  /** Next.js-style route pattern. Theme: rewrite rules / post_type_slug. */
  route: string;
  boxes: B;
  panels?: P;
  seo?: {
    title?: (page: PageDocument<N, B, P>) => string | undefined;
    description?: (page: PageDocument<N, B, P>) => string | undefined;
    image?: (page: PageDocument<N, B, P>) => MediaRef | undefined;
    noindex?: (page: PageDocument<N, B, P>) => boolean;
  };
  /** schema.org JSON-LD. Theme: settings()['schema']. */
  jsonLd?: (page: PageDocument<N, B, P>) => Record<string, unknown>;
  /** Hide from public queries/routes. Theme: settings()['hide_field']. */
  hidden?: (page: PageDocument<N, B, P>) => boolean;
  /**
   * Where boxes appear in the admin editor. Boxes not listed here get their
   * own section between the Page section and the panels, in declared order.
   */
  editor?: {
    /** Shown inside the Page section, under title and slug (e.g. admin settings). */
    pageBoxes?: ReadonlyArray<keyof B & string>;
    /** Shown just above the panels, styled like one (e.g. a hero that renders like a panel). */
    leadBoxes?: ReadonlyArray<keyof B & string>;
  };
  hooks?: {
    /** Theme: onsave_callback (could modify $_POST). */
    beforeSave?: (page: PageDocument<N, B, P>) => PageDocument<N, B, P> | Promise<PageDocument<N, B, P>>;
    /** Theme: aftersave_callback. */
    afterSave?: (page: PageDocument<N, B, P>) => void | Promise<void>;
  };
}

export interface ContentType<N extends string, B extends BoxMap, P extends readonly AnyPanel[]>
  extends ContentTypeConfig<N, B, P> {
  panels: P;
  /**
   * Strict, all-or-nothing schema for a fully valid page. Useful in tests and
   * scripts. For real reads and writes use `readPage` (tolerant, per panel)
   * and `preparePageForSave` (keeps unknown data, draft vs publish) from
   * `document.ts`.
   */
  pageSchema: z.ZodType<PageDocument<N, B, P>>;
}

/**
 * Any content type. `any` (not `string`/`BoxMap`) because the hook and seo
 * functions take the specific page type as a parameter, and parameters are
 * contravariant: `ContentType<'landing_page', …>` is not a
 * `ContentType<string, BoxMap, …>`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyContentType = ContentType<any, any, any>;

export type PageOf<CT> = CT extends ContentType<infer N, infer B, infer P> ? PageDocument<N, B, P> : never;

export function defineContentType<
  const N extends string,
  const B extends BoxMap,
  const P extends readonly AnyPanel[] = readonly [],
>(config: ContentTypeConfig<N, B, P>): ContentType<N, B, P> {
  const panels = (config.panels ?? []) as unknown as P;

  const seen = new Set<string>();
  for (const p of panels) {
    if (seen.has(p.type)) throw new Error(`Duplicate panel type "${p.type}" in content type "${config.name}".`);
    seen.add(p.type);
  }

  const boxesSchema = z.object(
    Object.fromEntries(Object.entries(config.boxes).map(([k, fields]) => [k, objectSchema(fields).default({} as never)])),
  );

  const instanceSchemas = panels.map((p) =>
    z.object({
      id: z.string(),
      type: z.literal(p.type),
      v: z.number().int().min(1),
      hidden: z.boolean().default(false),
      data: p.schema as z.ZodType,
    }),
  );

  const panelsSchema =
    instanceSchemas.length === 0
      ? z.array(z.never()).default([])
      : z.array(z.discriminatedUnion('type', instanceSchemas as [typeof instanceSchemas[number], ...typeof instanceSchemas])).default([]);

  const pageSchema = z.object({
    id: z.string(),
    contentType: z.literal(config.name),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case'),
    title: z.string().min(1),
    status: z.enum(['draft', 'published']).default('draft'),
    boxes: boxesSchema,
    panels: panelsSchema,
  }) as unknown as z.ZodType<PageDocument<N, B, P>>;

  return { ...config, panels, pageSchema };
}
