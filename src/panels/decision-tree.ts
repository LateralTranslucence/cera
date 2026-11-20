import { defineCorePanel } from '../define-panel.ts';
import { decisionTreeFields } from './decision-tree.fields.ts';

export { decisionTreeFields };

export const decisionTree = defineCorePanel({
  type: 'cera/decision-tree',
  label: 'Decision Tree',
  description: 'Two side-by-side choices; opening one shows its details and links.',
  fields: decisionTreeFields,
  component: () => import('./DecisionTree.tsx'),
});
