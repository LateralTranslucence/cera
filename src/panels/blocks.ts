import { defineCorePanel } from '../define-panel.ts';
import { blocksFields } from './blocks.fields.ts';

export const blocks = defineCorePanel({
  type: 'cera/blocks',
  label: 'Blocks',
  fields: blocksFields,
  component: () => import('./Blocks.tsx'),
});
