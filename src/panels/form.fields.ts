// Ported from set_panel_fields()['form']: the panel defaults plus the form
// to show (theme: a select of devo_form posts → a relation to one form).
import { field } from '../fields.ts';
import { panelDefaults } from '../defaults.ts';

export const formPanelFields = {
  ...panelDefaults,
  form: field.relation({ label: 'Form', to: ['cera_form'], limit: 1, note: 'Only a published form shows on the live site.' }),
};
