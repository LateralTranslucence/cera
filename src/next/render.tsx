/**
 * Renderer — the successor to LandingPage → Panel → PanelLoader.
 * Sketch only: Server Component compatibility, Suspense boundaries and
 * error boundaries per panel are for Claude Code to decide (see HANDOFF.md).
 */
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import type { AnyContentType, PageOf } from '../content-type.ts';
import type { AnyPanel, PanelComponentProps } from '../panel.ts';

const cache = new WeakMap<AnyPanel, LazyExoticComponent<ComponentType<PanelComponentProps<unknown>>>>();

function componentFor(def: AnyPanel) {
  let c = cache.get(def);
  if (!c) {
    c = lazy(def.component as () => Promise<{ default: ComponentType<PanelComponentProps<unknown>> }>);
    cache.set(def, c);
  }
  return c;
}

export function Panels<CT extends AnyContentType>({ contentType, page }: { contentType: CT; page: PageOf<CT> }) {
  const byType = new Map<string, AnyPanel>(contentType.panels.map((p: AnyPanel) => [p.type, p]));
  const visible = (page.panels as Array<{ id: string; type: string; hidden: boolean; data: unknown }>).filter((p) => !p.hidden);
  return (
    <>
      {visible.map((p, index) => {
        const def = byType.get(p.type);
        if (!def) return null;
        const Component = componentFor(def);
        return (
          <Suspense key={p.id} fallback={null}>
            <Component
              data={p.data}
              panel={{ pageId: page.id, panelId: p.id, index, contentType: contentType.name }}
            />
          </Suspense>
        );
      })}
    </>
  );
}
