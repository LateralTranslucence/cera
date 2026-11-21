/**
 * Panels — the successor to `set_panel_fields()` + `set_panel_types()` in
 * class-landing-page.php AND the `PanelLoader.tsx` map, defined once.
 */
import type { ComponentType } from 'react';
import type { z } from 'zod';
import type { FieldMap, InferFields, MediaRef } from './fields.ts';
import type { PublicForm } from './forms/model.ts';
import type { IconResolver } from './icons/library.ts';

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

/** Looks up forms for Form panels (see `createFormResolver` in `cera/supabase`). */
export interface FormResolver {
  /** The live form, or its working copy in draft-mode preview; null if there's none to show. */
  byId(id: string): Promise<PublicForm | null>;
  /** Where forms post (the site's form route handler). */
  endpoint: string;
}

/** What a panel's `load` gets besides its own data. */
export interface LoadContext {
  pages: PageResolver;
  /** Needed by Form panels. */
  forms?: FormResolver;
  /** Needed by panels with icons (`field.icon()` fields), e.g. Blocks. Without it, icons aren't drawn. */
  icons?: IconResolver;
  /** True in draft-mode preview: linked pages resolve to their working copies. */
  draft: boolean;
  page: { id: string; contentType: string; slug: string };
  panel: PanelContext;
}

/** Runs on the server before the panel renders; its result arrives as the component's `loaded` prop. */
export type PanelLoad<Data, Loaded> = (data: Data, ctx: LoadContext) => Loaded | Promise<Loaded>;

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

/** `loaded` is only part of the props for panels that define `load`. */
export type PanelComponentProps<Data, Loaded = undefined> = { data: Data; panel: PanelContext } & ([Loaded] extends [undefined] ? {} : { loaded: Loaded });

/**
 * Props for a component rendering a panel built from field map `Fields`, with
 * `Loaded` the result of its `load` (if any):
 *   PanelPropsOf<typeof featuredPostFields, FeaturedPostLoaded>
 */
export type PanelPropsOf<Fields extends FieldMap, Loaded = undefined> = PanelComponentProps<InferFields<Fields>, Loaded>;

export type ComponentLoader<Props> = () => Promise<{ default: ComponentType<Props> }>;

/** Upgrades stored data from version `n` to `n + 1`. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

export interface PanelDefinition<TypeName extends string = string, Fields extends FieldMap = FieldMap, Loaded = undefined> {
  readonly type: TypeName;
  readonly label: string;
  readonly description?: string;
  /** Bump when `fields` change shape; add a migration for the previous version. */
  readonly version: number;
  readonly fields: Fields;
  readonly schema: z.ZodType<InferFields<Fields>>;
  readonly load?: PanelLoad<InferFields<Fields>, Loaded>;
  readonly component: ComponentLoader<PanelPropsOf<Fields, Loaded>>;
  readonly migrations: Readonly<Record<number, Migration>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPanel = PanelDefinition<string, any, any>;

/** Stored data for a panel definition. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PanelData<Definition> = Definition extends PanelDefinition<string, infer Fields, any> ? InferFields<Fields> : never;

/** One panel as stored in `pages.panels` (JSONB array). Distributes over unions → discriminated by `type`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PanelInstance<Definition> = Definition extends PanelDefinition<infer TypeName, infer Fields, any>
  ? { id: string; type: TypeName; v: number; hidden: boolean; data: InferFields<Fields> }
  : never;

export type PanelUnion<Ps extends readonly AnyPanel[]> = PanelInstance<Ps[number]>;
