import { defineCorePanel } from '../define-panel.ts';
import { statsFields } from './stats.fields.ts';

export { statsFields };

export const stats = defineCorePanel({
  type: 'cera/stats',
  label: 'Stats',
  description: 'Large numbers with labels that count up when they scroll into view.',
  fields: statsFields,
  component: () => import('./Stats.tsx'),
});
