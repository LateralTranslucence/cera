import { defineCorePanel } from '../define-panel.ts';
import { quotesFields } from './quotes.fields.ts';

export { quotesFields };

export const quotes = defineCorePanel({
  type: 'cera/quotes',
  label: 'Quotes',
  description: 'Testimonials or quotations; more than one scroll sideways.',
  fields: quotesFields,
  component: () => import('./Quotes.tsx'),
});
