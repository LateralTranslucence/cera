// Server-side: draws the blocks' icons before the panel renders, through
// loadContext.icons (see cera/icons). Without it, or for an icon that no
// longer resolves (deleted, not live), the block shows no icon.
import type { InferFields } from '../fields.ts';
import type { IconGlyph } from '../icons/library.ts';
import type { LoadContext } from '../panel.ts';
import type { blocksFields } from './blocks.fields.ts';

export async function loadBlocks(data: InferFields<typeof blocksFields>, ctx: LoadContext) {
  const values = data.blocks.filter((block) => !block.hidden && block.icon).map((block) => block.icon!);
  const found = values.length > 0 && ctx.icons ? await ctx.icons.byValues(values) : new Map<string, IconGlyph>();
  return { icons: Object.fromEntries(found) as Record<string, IconGlyph> };
}

export type BlocksLoaded = Awaited<ReturnType<typeof loadBlocks>>;
