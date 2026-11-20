// Form field types, ported from DO_Form's "Field" box and field_configuration
// (class-form.php). Each is a panel in the form's editor, so fields reorder,
// duplicate and hide like panels; "Hide Field" is the panel's own Hidden
// switch. A Section starts a fieldset (theme: the Fieldsets box of
// comma-separated field IDs).
import { defineCorePanel } from '../define-panel.ts';
import { f } from '../fields.ts';

const component = () => import('./NoComponent.tsx');

/** What every field has (theme: Label, ID, Required, Hide Label). */
const common = {
  label: f.text({ label: 'Label', required: true }),
  name: f.text({ label: 'Field ID', note: 'The name its answer is saved under. Default: made from the label.' }),
  required: f.toggle({ label: 'Required' }),
  hideLabel: f.toggle({ label: 'Hide label', note: 'Hidden on screen; screen readers still read it.' }),
  note: f.text({ label: 'Help text', note: 'Shown under the field.' }),
};

const options = (opts: { describe?: boolean } = {}) =>
  f.repeater({
    label: 'Options',
    itemTitle: 'label',
    min: 1,
    fields: {
      label: f.text({ label: 'Label', required: true }),
      value: f.text({ label: 'Value', note: 'Saved with the answer. Default: the label.' }),
      ...(opts.describe ? { description: f.text({ label: 'Description' }) } : {}),
    },
  });

/** HTML autocomplete tokens for text fields (WCAG 1.3.5). Email and phone fields set their own. */
export const AUTOCOMPLETE = {
  none: 'None',
  name: 'Full name',
  'given-name': 'First name',
  'family-name': 'Last name',
  organization: 'Organization',
  'organization-title': 'Job title',
  'street-address': 'Street address',
  'address-line1': 'Address line 1',
  'address-line2': 'Address line 2',
  'address-level2': 'City',
  'address-level1': 'State or province',
  'postal-code': 'ZIP or postal code',
  'country-name': 'Country',
  url: 'Website',
  bday: 'Birthday',
} as const;

export const textField = defineCorePanel({
  type: 'cera/field-text',
  label: 'Text',
  description: 'One line of text.',
  fields: { ...common, autocomplete: f.select({ label: 'Autocomplete', options: AUTOCOMPLETE, default: 'none', note: 'Lets browsers fill it in.' }) },
  component,
});

export const emailField = defineCorePanel({
  type: 'cera/field-email',
  label: 'Email Address',
  description: 'An email address, checked for its format.',
  fields: common,
  component,
});

export const phoneField = defineCorePanel({
  type: 'cera/field-phone',
  label: 'Phone Number',
  description: 'A phone number.',
  fields: common,
  component,
});

export const textareaField = defineCorePanel({
  type: 'cera/field-textarea',
  label: 'Text Area',
  description: 'Several lines of text.',
  fields: common,
  component,
});

export const selectField = defineCorePanel({
  type: 'cera/field-select',
  label: 'Select',
  description: 'One choice from a dropdown.',
  fields: { ...common, options: options() },
  component,
});

export const radioField = defineCorePanel({
  type: 'cera/field-radio',
  label: 'Radio Buttons',
  description: 'One choice, all options shown.',
  fields: { ...common, options: options() },
  component,
});

export const buttonSelectField = defineCorePanel({
  type: 'cera/field-button-select',
  label: 'Button Select',
  description: 'One choice, shown as buttons with descriptions.',
  fields: { ...common, options: options({ describe: true }) },
  component,
});

export const checkboxField = defineCorePanel({
  type: 'cera/field-checkbox',
  label: 'Checkboxes',
  description: 'Any number of choices.',
  fields: { ...common, options: options() },
  component,
});

export const binaryField = defineCorePanel({
  type: 'cera/field-binary',
  label: 'Single Checkbox',
  description: 'One box to tick, e.g. to agree to something. The label is its text.',
  fields: common,
  component,
});

export const toggleField = defineCorePanel({
  type: 'cera/field-toggle',
  label: 'Toggle',
  description: 'An on/off switch.',
  fields: {
    ...common,
    offLabel: f.text({ label: 'Off answer', note: 'Default: “No”.' }),
    onLabel: f.text({ label: 'On answer', note: 'Default: “Yes”.' }),
  },
  component,
});

export const rangeField = defineCorePanel({
  type: 'cera/field-range',
  label: 'Range Slider',
  description: 'A whole number on a slider.',
  fields: {
    ...common,
    min: f.number({ label: 'Minimum', int: true, default: 0 }),
    max: f.number({ label: 'Maximum', int: true, default: 100 }),
    step: f.number({ label: 'Step', int: true, min: 1, default: 1 }),
  },
  component,
});

export const hiddenField = defineCorePanel({
  type: 'cera/field-hidden',
  label: 'Hidden',
  description: 'Sent with the form but not shown, e.g. where a visitor came from.',
  fields: {
    label: common.label,
    name: common.name,
    value: f.text({ label: 'Value', note: 'Sent when nothing below fills it in.' }),
    fromQuery: f.text({ label: 'From the address', note: 'A query parameter to fill it from, e.g. utm_source for ?utm_source=newsletter.' }),
  },
  component,
});

export const sectionField = defineCorePanel({
  type: 'cera/field-section',
  label: 'Section',
  description: 'Groups the fields after it under a heading, until the next section.',
  fields: {
    legend: f.text({ label: 'Heading', note: 'Leave empty to end the section above without starting a new one.' }),
    note: f.text({ label: 'Help text' }),
  },
  component,
});

/** Every form field type, in the order the admin lists them. */
export const formFields = [
  textField,
  emailField,
  phoneField,
  textareaField,
  selectField,
  radioField,
  buttonSelectField,
  checkboxField,
  binaryField,
  toggleField,
  rangeField,
  hiddenField,
  sectionField,
] as const;
