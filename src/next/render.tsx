/**
 * Renderer — the successor to LandingPage → Panel → PanelLoader.
 *
 * An async Server Component: it awaits each panel's `component()` import in
 * parallel, then renders the panels in order. Panel components can be Server
 * Components, or Client Components marked with 'use client' in their own file.
 *
 * A panel whose component fails to load is skipped (reported via `onError`)
 * instead of failing the page. Errors thrown while *rendering* a panel still
 * reach the nearest error.tsx; per-panel error boundaries need a client
 * component and are a later step.
 */
import type { ComponentType, ReactElement } from 'react';
import type { AnyContentType, PageOf } from '../content-type.ts';
import type { AnyPanel, PanelComponentProps } from '../panel.ts';

type StoredInstance = { id: string; type: string; hidden: boolean; data: unknown };

export interface PanelsProps<CT extends AnyContentType> {
  contentType: CT;
  page: PageOf<CT>;
  /** Called when a panel's component can't be loaded. Defaults to console.error. */
  onError?: (error: unknown, panel: { id: string; type: string }) => void;
}

export async function Panels<CT extends AnyContentType>({
  contentType,
  page,
  onError = (e, p) => console.error(`cera: panel ${p.type} (${p.id}) failed to load`, e),
}: PanelsProps<CT>): Promise<ReactElement> {
  const byType = new Map<string, AnyPanel>(contentType.panels.map((p: AnyPanel) => [p.type, p]));
  const visible = (page.panels as StoredInstance[]).filter((p) => !p.hidden);

  const loaded = await Promise.all(
    visible.map(async (p) => {
      const def = byType.get(p.type);
      if (!def) return null;
      try {
        const mod = await def.component();
        return { p, Component: mod.default as ComponentType<PanelComponentProps<unknown>> };
      } catch (e) {
        onError(e, p);
        return null;
      }
    }),
  );

  return (
    <>
      {loaded.map((entry, index) => {
        if (!entry) return null;
        const { p, Component } = entry;
        return <Component key={p.id} data={p.data} panel={{ pageId: page.id, panelId: p.id, index, contentType: contentType.name }} />;
      })}
    </>
  );
}
