/**
 * Panel versioning. A stored panel carries `v`; on read, run the panel's
 * migrations from `v` up to the current `version`, then validate.
 * Replaces nothing in the theme — this is the fix for "renaming a label
 * strands its saved data".
 */
import type { AnyPanel } from './panel.ts';

export interface StoredPanel {
  id: string;
  type: string;
  v: number;
  hidden?: boolean;
  data: Record<string, unknown>;
}

export function upgradePanel(definition: AnyPanel, stored: StoredPanel): StoredPanel {
  if (stored.type !== definition.type) throw new Error(`Type mismatch: stored "${stored.type}", definition "${definition.type}".`);
  if (stored.v > definition.version) {
    throw new Error(`Panel ${stored.id} is v${stored.v}, newer than definition v${definition.version}. Deploy order problem?`);
  }
  let data = stored.data;
  for (let v = stored.v; v < definition.version; v++) {
    const step = definition.migrations[v];
    if (!step) throw new Error(`Missing migration for "${definition.type}" v${v} → v${v + 1}.`);
    data = step(data);
  }
  return { ...stored, v: definition.version, data };
}

/** Upgrade every panel on a raw page row before `pageSchema.parse()`. Unknown types are dropped (logged). */
export function upgradePagePanels(
  panels: readonly AnyPanel[],
  stored: StoredPanel[],
  onUnknown: (panel: StoredPanel) => void = (panel) => console.warn(`Unknown panel type "${panel.type}" (${panel.id}) dropped.`),
): StoredPanel[] {
  const byType = new Map(panels.map((definition) => [definition.type, definition]));
  const out: StoredPanel[] = [];
  for (const storedPanel of stored) {
    const definition = byType.get(storedPanel.type);
    if (!definition) {
      onUnknown(storedPanel);
      continue;
    }
    out.push(upgradePanel(definition, storedPanel));
  }
  return out;
}
