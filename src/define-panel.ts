/**
 * `definePanel` for sites, and `defineCorePanel` for Cera's own panels.
 *
 * Panel types are kebab-case, optionally behind one namespace:
 * `pricing-table`, `acme/pricing-table`, `cera/blocks`. The `cera/` namespace
 * belongs to the panels that ship in `@lateraltranslucence/cera/panels`, so a
 * site's panel can never collide with a core one, and a type stored in a page
 * always means the same panel. `defineCorePanel` isn't exported from the
 * package entry points.
 */
import { type FieldMap, type InferFields, objectSchema } from './fields.ts';
import type { ComponentLoader, Migration, PanelDefinition, PanelLoad, PanelPropsOf } from './panel.ts';

export interface PanelInput<T extends string, M extends FieldMap, L> {
  type: T;
  label: string;
  description?: string;
  version?: number;
  fields: M;
  load?: PanelLoad<InferFields<M>, L>;
  component: ComponentLoader<PanelPropsOf<M, Awaited<L>>>;
  /** Keyed by the version being upgraded FROM. */
  migrations?: Record<number, Migration>;
}

const TYPE = /^(?:([a-z][a-z0-9-]*)\/)?[a-z][a-z0-9-]*$/;
const CORE_NAMESPACE = 'cera';

/**
 * Defines a panel. With `load`, keep it in its own file (like the fields) so
 * the component can import its result type without a circular reference:
 *
 *   // featured-post.load.ts
 *   export const loadFeaturedPost = async (data, ctx) => ({ page: … });
 *   export type FeaturedPostLoaded = Awaited<ReturnType<typeof loadFeaturedPost>>;
 *
 * The type can't start with `cera/`; that namespace is for Cera's own panels.
 */
export function definePanel<const T extends string, const M extends FieldMap, L = undefined>(
  def: PanelInput<T, M, L>,
): PanelDefinition<T, M, Awaited<L>> {
  const namespace = namespaceOf(def.type);
  if (namespace === CORE_NAMESPACE) {
    const name = def.type.slice(CORE_NAMESPACE.length + 1);
    throw new Error(
      `Panel type "${def.type}" is reserved: "${CORE_NAMESPACE}/" is for Cera's own panels. Name it "${name}", or use your own namespace, like "acme/${name}".`,
    );
  }
  return build(def);
}

/** Defines one of Cera's own panels. Its type must start with `cera/`. */
export function defineCorePanel<const T extends `${typeof CORE_NAMESPACE}/${string}`, const M extends FieldMap, L = undefined>(
  def: PanelInput<T, M, L>,
): PanelDefinition<T, M, Awaited<L>> {
  if (namespaceOf(def.type) !== CORE_NAMESPACE) throw new Error(`Core panel type "${def.type}" must start with "${CORE_NAMESPACE}/".`);
  return build(def);
}

function namespaceOf(type: string): string | undefined {
  const match = TYPE.exec(type);
  if (!match) {
    throw new Error(`Panel type "${type}" must be kebab-case, optionally behind one namespace: "pricing-table" or "acme/pricing-table".`);
  }
  return match[1];
}

function build<T extends string, M extends FieldMap, L>(def: PanelInput<T, M, L>): PanelDefinition<T, M, Awaited<L>> {
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
