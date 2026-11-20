import { defineCorePanel } from '../define-panel.ts';
import { formPanelFields } from './form.fields.ts';
import { loadForm } from './form.load.ts';

export { formPanelFields };

export const formPanel = defineCorePanel({
  type: 'cera/form',
  label: 'Form',
  description: 'One of your forms.',
  fields: formPanelFields,
  load: loadForm,
  component: () => import('./Form.tsx'),
});
