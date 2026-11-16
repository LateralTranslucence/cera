/**
 * Panels — the successor to `set_panel_fields()` + `set_panel_types()` in
 * class-landing-page.php AND the `PanelLoader.tsx` map, defined once.
 */
import type { ComponentType } from 'react';
import type { z } from 'zod';
import { type FieldMap, type InferFields, objectSchema } from './fields.ts';

export interface PanelContext {
  pageId: string;
  panelId: string;
  /** 0-based position on the page. */
  index: number;
  contentType: string;
}

export interface PanelComponentProps<D> {
  data: D;
  panel: PanelContext;
}

/** Props for a component rendering a panel built from field map `M`. */
export type PanelPropsOf<M extends FieldMap> = PanelComponentProps<InferFields<M>>;

export type ComponentLoader<P> = () => Promise<{ default: ComponentType<P> }>;

/** Upgrades stored data from version `n` to `n + 1`. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

export interface PanelDefinition<T extends string = string, M extends FieldMap = FieldMap> {
  readonly type: T;
  readonly label: string;
  readonly description?: string;
  /** Bump when `fields` change shape; add a migration for the previous version. */
  readonly version: number;
  readonly fields: M;
  readonly schema: z.ZodType<InferFields<M>>;
  readonly component: ComponentLoader<PanelPropsOf<M>>;
  readonly migrations: Readonly<Record<number, Migration>>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPanel = PanelDefinition<string, any>;

export function definePanel<const T extends string, const M extends FieldMap>(def: {
  type: T;
  label: string;
  description?: string;
  version?: number;
  fields: M;
  component: ComponentLoader<PanelPropsOf<M>>;
  /** Keyed by the version being upgraded FROM. */
  migrations?: Record<number, Migration>;
}): PanelDefinition<T, M> {
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
    component: def.component,
    migrations: def.migrations ?? {},
  };
}

/** Stored data for a panel definition. */
export type PanelData<P> = P extends PanelDefinition<string, infer M> ? InferFields<M> : never;

/** One panel as stored in `pages.panels` (JSONB array). Distributes over unions → discriminated by `type`. */
export type PanelInstance<P> = P extends PanelDefinition<infer T, infer M>
  ? { id: string; type: T; v: number; hidden: boolean; data: InferFields<M> }
  : never;

export type PanelUnion<Ps extends readonly AnyPanel[]> = PanelInstance<Ps[number]>;
