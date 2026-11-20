import { defineCorePanel } from '../define-panel.ts';
import { textFields } from './text.fields.ts';

export { textFields };

export const text = defineCorePanel({
  type: 'cera/text',
  label: 'Text',
  description: 'A title, copy and calls to action.',
  fields: textFields,
  component: () => import('./Text.tsx'),
});
