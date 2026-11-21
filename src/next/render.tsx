/**
 * Renderer — the successor to LandingPage → Panel → PanelLoader.
 *
 * An async Server Component. For every visible panel it imports the
 * component and runs the panel's `load` (if any) in parallel, then renders
 * the panels in order, passing the load result as `loaded`. Panel components
 * can be Server Components, or Client Components marked 'use client' in
 * their own file (then `loaded` must be serializable).
 *
 * A panel whose component or `load` fails is skipped (reported via
 * `onError`) instead of failing the page. Errors thrown while *rendering* a
 * panel still reach the nearest error.tsx; per-panel error boundaries need a
 * client component and are a later step.
 */
import type { ComponentType, ReactElement } from 'react';
import type { AnyContentType, PageOf } from '../content-type.ts';
import type { AnyPanel, LoadContext, PanelContext } from '../panel.ts';

type StoredInstance = { id: string; type: string; hidden: boolean; data: unknown };

export interface PanelsProps<Type extends AnyContentType> {
  contentType: Type;
  page: PageOf<Type>;
  /**
   * Needed when any panel defines `load`: how to look up linked pages, and
   * whether this is a draft preview. Panels with `load` are skipped without it.
   */
  loadContext?: Pick<LoadContext, 'pages' | 'draft' | 'forms' | 'icons'>;
  /** Called when a panel's component or `load` fails. Defaults to console.error. */
  onError?: (error: unknown, panel: { id: string; type: string }) => void;
}

export async function Panels<Type extends AnyContentType>({
  contentType,
  page,
  loadContext,
  onError = (error, failedPanel) => console.error(`cera: panel ${failedPanel.type} (${failedPanel.id}) failed to load`, error),
}: PanelsProps<Type>): Promise<ReactElement> {
  const byType = new Map<string, AnyPanel>(contentType.panels.map((definition: AnyPanel) => [definition.type, definition]));
  const visible = (page.panels as StoredInstance[]).filter((instance) => !instance.hidden);

  const prepared = await Promise.all(
    visible.map(async (instance, index) => {
      const def = byType.get(instance.type);
      if (!def) return null;
      const panel: PanelContext = { pageId: page.id, panelId: instance.id, index, contentType: contentType.name };
      try {
        const [mod, loaded] = await Promise.all([
          def.component(),
          def.load
            ? loadContext
              ? def.load(instance.data as Record<string, unknown>, { ...loadContext, page: { id: page.id, contentType: contentType.name, slug: page.slug }, panel })
              : Promise.reject(new Error(`Panel "${instance.type}" loads data, but <Panels> was given no loadContext.`))
            : undefined,
        ]);
        return { instance, panel, loaded, hasLoad: Boolean(def.load), Component: mod.default as ComponentType<Record<string, unknown>> };
      } catch (error) {
        onError(error, instance);
        return null;
      }
    }),
  );

  return (
    <>
      {prepared.map((entry) => {
        if (!entry) return null;
        const { instance, panel, loaded, hasLoad, Component } = entry;
        return <Component key={instance.id} data={instance.data} panel={panel} {...(hasLoad && { loaded })} />;
      })}
    </>
  );
}
