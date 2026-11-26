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
import type { CeraRole } from './roles.ts';
import type { IconName } from './admin/icons.tsx';

export type BoxMap = Record<string, FieldMap>;

export type PageStatus = 'draft' | 'published';

/** One link in a breadcrumb trail. */
export interface Breadcrumb {
  text: string;
  url: string;
}

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
  /**
   * The roles that may write pages of this type (theme:
   * settings()['restrict_users']). Default: admins, editors and authors.
   * Viewers can never save, so listing `viewer` changes nothing, and authors
   * never publish or delete (see `pageRights`).
   * The site's server actions enforce it (see `canEditContentType`).
   */
  editRoles?: readonly CeraRole[];
  /**
   * False for types whose pages are never published, like notes for the
   * team: published versions are readable by anyone, so these stay working
   * copies, read in the admin. `savePage` refuses to publish or schedule
   * them, and the editor offers only Save. Default true.
   */
  publishable?: boolean;
  /**
   * Breadcrumbs shown before every page of this type
   * (theme: settings()['breadcrumbs']), e.g. [{ text: 'Guides', url: '/guides' }].
   */
  breadcrumbs?: readonly Breadcrumb[];
  /** A page's own breadcrumbs, after the type's, e.g. from a field editors fill in. */
  pageBreadcrumbs?: (page: PageDocument<Name, Boxes, Panels>) => Breadcrumb[];
  boxes: Boxes;
  /**
   * Boxes visitors must never see (theme: private_fields), e.g. a form's
   * email settings. They're edited and saved like any box, with history, but
   * kept out of what visitors can read, published versions included: pages
   * read for the live site have their defaults. The server reads them with
   * `getPrivateBoxes` and the secret key.
   */
  privateBoxes?: ReadonlyArray<keyof Boxes & string>;
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
   * How the admin shows this type: its place in the sidebar, its screens'
   * address and names, and where boxes appear in the editor. Everything is
   * optional; the admin builds the sidebar item, list, new and edit screens
   * from it (`createAdminScreens`).
   */
  editor?: {
    /**
     * The type's address under /admin, e.g. `simple-pages` → /admin/simple-pages.
     * Default: `label` in the plural, in kebab case ("Simple Page" → `simple-pages`).
     */
    path?: string;
    /** The list's heading and the sidebar label. Default: `label` in the plural ("Simple Pages"). */
    title?: string;
    /** The sidebar icon. Default `article`. */
    icon?: IconName;
    /** The sidebar group it's listed under. Default `Content`. */
    section?: string;
    /** The lowest role that sees the type in the admin. Default `viewer` (everyone signed in). */
    listRole?: CeraRole;
    /**
     * Boxes not listed in `pageBoxes` or `leadBoxes` get their own section
     * between the Page section and the panels, in declared order.
     */
    /** Shown inside the Page section, under title and slug (e.g. admin settings). */
    pageBoxes?: ReadonlyArray<keyof Boxes & string>;
    /** Shown just above the panels, styled like one (e.g. a hero that renders like a panel). */
    leadBoxes?: ReadonlyArray<keyof Boxes & string>;
    /** What the admin calls one of these, lowercase. Default: `label` in lowercase ("simple page"). */
    noun?: string;
    /** Plural of `noun`. Default: `noun` in the plural. */
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

/**
 * A page's breadcrumb trail: the content type's breadcrumbs, then the
 * page's own, then the page itself (without a link to itself, its url is
 * kept for structured data). Links without text are left out.
 */
export function breadcrumbsFor<Type extends AnyContentType>(contentType: Type, page: PageOf<Type>): Breadcrumb[] {
  const trail = [...(contentType.breadcrumbs ?? []), ...(contentType.pageBreadcrumbs?.(page) ?? [])].filter((crumb) => crumb.text?.trim());
  return [...trail, { text: page.title, url: pageUrl(contentType, page) }];
}

/** A page's public URL: the content type's `url`, or its `route` with `[slug]` filled in. */
export function pageUrl<Type extends AnyContentType>(contentType: Type, page: PageOf<Type>): string {
  if (contentType.url) return contentType.url(page);
  return contentType.route ? contentType.route.replace('[slug]', encodeURIComponent(page.slug)) : '';
}

/** "Simple Page" → "Simple Pages", "Case Study" → "Case Studies", "Box" → "Boxes". */
export function pluralize(words: string): string {
  if (/[^aeiou]y$/i.test(words)) return `${words.slice(0, -1)}ies`;
  if (/(?:s|x|z|ch|sh)$/i.test(words)) return `${words}es`;
  return `${words}s`;
}

/** What the admin calls one of these, lowercase: `editor.noun`, else `label` ("simple page"). */
export function adminNounOf(contentType: AnyContentType): string {
  return contentType.editor?.noun ?? contentType.label.toLowerCase();
}

/** The plural of `adminNounOf`: `editor.nounPlural`, else the noun in the plural. */
export function adminNounPluralOf(contentType: AnyContentType): string {
  return contentType.editor?.nounPlural ?? pluralize(adminNounOf(contentType));
}

/** The list's heading and sidebar label: `editor.title`, else `label` in the plural. */
export function adminTitleOf(contentType: AnyContentType): string {
  return contentType.editor?.title ?? pluralize(contentType.label);
}

/** The type's address under /admin: `editor.path`, else its plural label in kebab case. */
export function adminPathOf(contentType: AnyContentType): string {
  return (
    contentType.editor?.path ??
    pluralize(contentType.label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  );
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Which content types serve a public path, and the slug in it. */
export interface RouteMatch<Type extends AnyContentType> {
  /** Every type with the matching route (types sharing a route share a `slugScope`). */
  types: Type[];
  slug: string;
}

/**
 * The content types whose `route` matches `path`, and the slug it names. A
 * route is static segments plus one `[slug]`, e.g. `/[slug]` or
 * `/guides/[slug]`. The site's home, `/`, is the page with slug `home` of the
 * types routed at `/[slug]`. When two routes fit (`/guides/[slug]` and
 * `/[slug]/print` both fit /guides/print), the first type's wins. `null` when
 * nothing matches or the slug isn't one Cera could have saved.
 */
export function matchRoute<const Types extends readonly AnyContentType[]>(contentTypes: Types, path: string | readonly string[]): RouteMatch<Types[number]> | null {
  const segments = (typeof path === 'string' ? path.split('/') : [...path]).filter(Boolean);
  if (segments.length === 0) {
    const types = contentTypes.filter((contentType) => contentType.route === '/[slug]');
    return types.length > 0 ? { types, slug: 'home' } : null;
  }
  for (const route of new Set(contentTypes.map((contentType) => contentType.route).filter((route): route is string => Boolean(route)))) {
    const pattern = route.split('/').filter(Boolean);
    if (pattern.length !== segments.length || pattern.filter((part) => part === '[slug]').length !== 1) continue;
    const slugIndex = pattern.indexOf('[slug]');
    const slug = segments[slugIndex]!;
    if (!SLUG.test(slug) || !pattern.every((part, i) => i === slugIndex || part === segments[i])) continue;
    return { types: contentTypes.filter((contentType) => contentType.route === route), slug };
  }
  return null;
}
