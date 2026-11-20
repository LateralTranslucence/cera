import { defineCorePanel } from '../define-panel.ts';
import { ctaFields } from './cta.fields.ts';

export { ctaFields };

export const cta = defineCorePanel({
  type: 'cera/cta',
  label: 'CTA',
  description: 'A call to action: a short title and copy with buttons.',
  fields: ctaFields,
  component: () => import('./Cta.tsx'),
});
