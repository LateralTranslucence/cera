import { defineCorePanel } from '../define-panel.ts';
import { accordionFields } from './accordion.fields.ts';

export { accordionFields };

export const accordion = defineCorePanel({
  type: 'cera/accordion',
  label: 'Accordion',
  description: 'Questions or headings that open to show their text, one at a time.',
  fields: accordionFields,
  component: () => import('./Accordion.tsx'),
});
