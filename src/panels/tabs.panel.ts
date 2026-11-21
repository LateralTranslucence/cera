import { defineCorePanel } from '../define-panel.ts';
import { tabsFields } from './tabs.fields.ts';

export { tabsFields };

export const tabs = defineCorePanel({
  type: 'cera/tabs',
  label: 'Tabs',
  description: 'Content in tabs; each tab has a title, media, copy and a CTA.',
  fields: tabsFields,
  component: () => import('./Tabs.tsx'),
});
