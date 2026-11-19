import { definePanel } from '@lateraltranslucence/cera';
import { blocksFields } from './blocks.fields.ts';

export const blocks = definePanel({
  type: 'blocks',
  label: 'Blocks',
  fields: blocksFields,
  component: () => import('./Blocks.tsx'),
});
