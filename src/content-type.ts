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

export interface PageDocument<Name extends string, Boxes extends BoxMap, Panels extends readonly AnyPanel[]> {
  id: string;
  contentType: Name;
  slug: string;
  title: string;
  status: PageStatus;
  boxes: { [BoxName in keyof Boxes]: InferFields<Boxes[BoxName]> };
  panels: PanelUnion<Panels>[];
}

export interface ContentTypeConfig<Name extends string, Boxes extends BoxMap, Panels extends readonly AnyPanel[]> {
  name: Name;
  label: string;
  /**
   * Next.js-style route pattern. Theme: rewrite rules / post_type_slug.
   * Omit for content types without public pages of their own (e.g. forms,
   * which panels show on other pages).
   */
  route?: string;
  /**
   * Content types with the same `slugScope` share one set of addresses: a
   * slug one of them uses can't be used by another (the database enforces
   * it). Give types that share a route the same scope, e.g. a simple page
   * living at /[slug] next to landing pages: `slugScope: 'landing_page'`.
   * Defaults to `name`.
   */
  slugScope?: string;
  /** A page's public URL. Defaults to `route` with `[slug]` filled in. */
  url?: (page: PageDocument<Name, Boxes, Panels>) => string;
  boxes: Boxes;
  panels?: Panels;
  seo?: {
    title?: (page: PageDocument<Name, Boxes, Panels>) => string | undefined;
    description?: (page: PageDocument<Name, Boxes, Panels>) => string | undefined;
    image?: (page: PageDocument<Name, Boxes, Panels>) => MediaRef | undefined;
    noindex?: (page: PageDocument<Name, Boxes, Panels>) => boolean;
  };
  /** schema.org JSON-LD. Theme: settings()['schema']. */
  jsonLd?: (page: PageDocument<Name, Boxes, Panels>) => Record<string, unknown>;
  /** Hide from public queries/routes. Theme: settings()['hide_field']. */
  hidden?: (page: PageDocument<Name, Boxes, Panels>) => boolean;
  /**
   * Where boxes appear in the admin editor. Boxes not listed here get their
   * own section between the Page section and the panels, in declared order.
   */
  editor?: {
    /** Shown inside the Page section, under title and slug (e.g. admin settings). */
    pageBoxes?: ReadonlyArray<keyof Boxes & string>;
    /** Shown just above the panels, styled like one (e.g. a hero that renders like a panel). */
    leadBoxes?: ReadonlyArray<keyof Boxes & string>;
    /** What the admin calls one of these, lowercase. Default "page". */
    noun?: string;
    /** Plural of `noun`. Default: `noun` + "s". */
    nounPlural?: string;
    /** What the admin calls one panel, lowercase. Default "panel" (forms: "field"). */
    itemNoun?: string;
    /** Label for the title field. Default "Title". */
    titleLabel?: string;
    /** Label for the slug field. Default "Address". */
    slugLabel?: string;
    /** Note under the slug field. */
    slugNote?: string;
  };
  hooks?: {
    /** Theme: onsave_callback (could modify $_POST). */
    beforeSave?: (page: PageDocument<Name, Boxes, Panels>) => PageDocument<Name, Boxes, Panels> | Promise<PageDocument<Name, Boxes, Panels>>;
    /** Theme: aftersave_callback. */
    afterSave?: (page: PageDocument<Name, Boxes, Panels>) => void | Promise<void>;
  };
}

export interface ContentType<Name extends string, Boxes extends BoxMap, Panels extends readonly AnyPanel[]>
  extends ContentTypeConfig<Name, Boxes, Panels> {
  panels: Panels;
  /**
   * Strict, all-or-nothing schema for a fully valid page. Useful in tests and
   * scripts. For real reads and writes use `readPage` (tolerant, per panel)
   * and `preparePageForSave` (keeps unknown data, draft vs publish) from
   * `document.ts`.
   */
  pageSchema: z.ZodType<PageDocument<Name, Boxes, Panels>>;
}

/**
 * Any content type. `any` (not `string`/`BoxMap`) because the hook and seo
 * functions take the specific page type as a parameter, and parameters are
 * contravariant: `ContentType<'landing_page', …>` is not a
 * `ContentType<string, BoxMap, …>`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyContentType = ContentType<any, any, any>;

export type PageOf<Type> = Type extends ContentType<infer Name, infer Boxes, infer Panels> ? PageDocument<Name, Boxes, Panels> : never;

export function defineContentType<
  const Name extends string,
  const Boxes extends BoxMap,
  const Panels extends readonly AnyPanel[] = readonly [],
>(config: ContentTypeConfig<Name, Boxes, Panels>): ContentType<Name, Boxes, Panels> {
  const panels = (config.panels ?? []) as unknown as Panels;

  const seen = new Set<string>();
  for (const panel of panels) {
    if (seen.has(panel.type)) throw new Error(`Duplicate panel type "${panel.type}" in content type "${config.name}".`);
    seen.add(panel.type);
  }

  const boxesSchema = z.object(
    Object.fromEntries(Object.entries(config.boxes).map(([boxName, fields]) => [boxName, objectSchema(fields).default({} as never)])),
  );

  const instanceSchemas = panels.map((panel) =>
    z.object({
      id: z.string(),
      type: z.literal(panel.type),
      v: z.number().int().min(1),
      hidden: z.boolean().default(false),
      data: panel.schema as z.ZodType,
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
  }) as unknown as z.ZodType<PageDocument<Name, Boxes, Panels>>;

  return { ...config, panels, pageSchema };
}

/** A page's public URL: the content type's `url`, or its `route` with `[slug]` filled in. */
export function pageUrl<Type extends AnyContentType>(ct: Type, page: PageOf<Type>): string {
  if (ct.url) return ct.url(page);
  return ct.route ? ct.route.replace('[slug]', encodeURIComponent(page.slug)) : '';
}
