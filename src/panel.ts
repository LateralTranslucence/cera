/**
 * Panels — the successor to `set_panel_fields()` + `set_panel_types()` in
 * class-landing-page.php AND the `PanelLoader.tsx` map, defined once.
 */
import type { ComponentType } from 'react';
import type { z } from 'zod';
import { type FieldMap, type InferFields, type MediaRef, objectSchema } from './fields.ts';

export interface PanelContext {
  pageId: string;
  panelId: string;
  /** 0-based position on the page. */
  index: number;
  contentType: string;
}

/* ------------------------------------------------------------------ */
/* Server-side data loading                                            */
/* ------------------------------------------------------------------ */

/** Another page, as a panel sees it: enough to show a teaser and link to it. */
export interface LinkedPage {
  id: string;
  contentType: string;
  /** The content type's label, e.g. "Landing Page" (theme: post type display name). */
  contentTypeLabel: string;
  slug: string;
  title: string;
  /** Public URL, from the content type's `url` (or its `route`). */
  url: string;
  /** From the content type's `seo.description`. */
  description?: string;
  /** From the content type's `seo.image`. */
  image?: MediaRef;
}

/** Looks up other pages. Returns only pages the current view may show, in the order asked. */
export interface PageResolver {
  byIds(ids: readonly string[]): Promise<LinkedPage[]>;
}

/** What a panel's `load` gets besides its own data. */
export interface LoadContext {
  pages: PageResolver;
  /** True in draft-mode preview: linked pages resolve to their working copies. */
  draft: boolean;
  page: { id: string; contentType: string; slug: string };
  panel: PanelContext;
}

/** Runs on the server before the panel renders; its result arrives as the component's `loaded` prop. */
export type PanelLoad<D, L> = (data: D, ctx: LoadContext) => L | Promise<L>;

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

/** `loaded` is only part of the props for panels that define `load`. */
export type PanelComponentProps<D, L = undefined> = { data: D; panel: PanelContext } & ([L] extends [undefined] ? {} : { loaded: L });

/**
 * Props for a component rendering a panel built from field map `M`, with
 * `L` the result of its `load` (if any):
 *   PanelPropsOf<typeof featuredPostFields, FeaturedPostLoaded>
 */
export type PanelPropsOf<M extends FieldMap, L = undefined> = PanelComponentProps<InferFields<M>, L>;

export type ComponentLoader<P> = () => Promise<{ default: ComponentType<P> }>;

/** Upgrades stored data from version `n` to `n + 1`. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

export interface PanelDefinition<T extends string = string, M extends FieldMap = FieldMap, L = undefined> {
  readonly type: T;
  readonly label: string;
  readonly description?: string;
  /** Bump when `fields` change shape; add a migration for the previous version. */
  readonly version: number;
  readonly fields: M;
  readonly schema: z.ZodType<InferFields<M>>;
  readonly load?: PanelLoad<InferFields<M>, L>;
  readonly component: ComponentLoader<PanelPropsOf<M, L>>;
  readonly migrations: Readonly<Record<number, Migration>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPanel = PanelDefinition<string, any, any>;

/**
 * Defines a panel. With `load`, keep it in its own file (like the fields) so
 * the component can import its result type without a circular reference:
 *
 *   // featured-post.load.ts
 *   export const loadFeaturedPost = async (data, ctx) => ({ page: … });
 *   export type FeaturedPostLoaded = Awaited<ReturnType<typeof loadFeaturedPost>>;
 */
export function definePanel<const T extends string, const M extends FieldMap, L = undefined>(def: {
  type: T;
  label: string;
  description?: string;
  version?: number;
  fields: M;
  load?: PanelLoad<InferFields<M>, L>;
  component: ComponentLoader<PanelPropsOf<M, Awaited<L>>>;
  /** Keyed by the version being upgraded FROM. */
  migrations?: Record<number, Migration>;
}): PanelDefinition<T, M, Awaited<L>> {
  if (!/^[a-z][a-z0-9-]*$/.test(def.type)) {
    throw new Error(`Panel type "${def.type}" must be kebab-case (matches the theme's PanelLoader keys).`);
  }
  const version = def.version ?? 1;
  for (let v = 1; v < version; v++) {
    if (!def.migrations?.[v]) throw new Error(`Panel "${def.type}" is v${version} but has no migration from v${v}.`);
  }
  return {
    type: def.type,
    label: def.label,
    description: def.description,
    version,
    fields: def.fields,
    schema: objectSchema(def.fields),
    load: def.load as PanelLoad<InferFields<M>, Awaited<L>> | undefined,
    component: def.component,
    migrations: def.migrations ?? {},
  };
}

/** Stored data for a panel definition. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PanelData<P> = P extends PanelDefinition<string, infer M, any> ? InferFields<M> : never;

/** One panel as stored in `pages.panels` (JSONB array). Distributes over unions → discriminated by `type`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PanelInstance<P> = P extends PanelDefinition<infer T, infer M, any>
  ? { id: string; type: T; v: number; hidden: boolean; data: InferFields<M> }
  : never;

export type PanelUnion<Ps extends readonly AnyPanel[]> = PanelInstance<Ps[number]>;
