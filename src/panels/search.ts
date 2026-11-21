import { defineCorePanel } from '../define-panel.ts';
import { searchFields } from './search.fields.ts';
import { loadSearch } from './search.load.ts';

export { searchFields };

export const search = defineCorePanel({
  type: 'cera/search',
  label: 'Search',
  description: 'Lets visitors search pages, with filters, sorting and paging.',
  fields: searchFields,
  load: loadSearch,
  component: () => import('./Search.tsx'),
});
