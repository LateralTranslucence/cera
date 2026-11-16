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

export function upgradePanel(def: AnyPanel, stored: StoredPanel): StoredPanel {
  if (stored.type !== def.type) throw new Error(`Type mismatch: stored "${stored.type}", definition "${def.type}".`);
  if (stored.v > def.version) {
    throw new Error(`Panel ${stored.id} is v${stored.v}, newer than definition v${def.version}. Deploy order problem?`);
  }
  let data = stored.data;
  for (let v = stored.v; v < def.version; v++) {
    const step = def.migrations[v];
    if (!step) throw new Error(`Missing migration for "${def.type}" v${v} → v${v + 1}.`);
    data = step(data);
  }
  return { ...stored, v: def.version, data };
}

/** Upgrade every panel on a raw page row before `pageSchema.parse()`. Unknown types are dropped (logged). */
export function upgradePagePanels(
  panels: readonly AnyPanel[],
  stored: StoredPanel[],
  onUnknown: (p: StoredPanel) => void = (p) => console.warn(`Unknown panel type "${p.type}" (${p.id}) dropped.`),
): StoredPanel[] {
  const byType = new Map(panels.map((p) => [p.type, p]));
  const out: StoredPanel[] = [];
  for (const p of stored) {
    const def = byType.get(p.type);
    if (!def) {
      onUnknown(p);
      continue;
    }
    out.push(upgradePanel(def, p));
  }
  return out;
}
