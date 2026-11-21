import { defineCorePanel } from '../define-panel.ts';
import { blocksFields } from './blocks.fields.ts';
import { loadBlocks } from './blocks.load.ts';

export const blocks = defineCorePanel({
  type: 'cera/blocks',
  label: 'Blocks',
  fields: blocksFields,
  load: loadBlocks,
  component: () => import('./Blocks.tsx'),
});
