// The Form content type, ported from DO_Form (class-form.php). Forms have no
// pages of their own: a Form panel shows one on a page.
//
// Differences from the theme:
//   - Fields are panels (see fields.ts); Sections replace the Fieldsets box.
//   - "Privacy Policy" (a link to WordPress's privacy page) is a Privacy note
//     you write, shown above the button.
//   - "Field Label Location" and "Auto-update?" are dropped: the theme's front
//     end ignored the first and the second hid the submit button.
//   - No email settings yet: submissions are stored and read in the admin.
import { defineContentType } from '../content-type.ts';
import { field } from '../fields.ts';
import { formFields } from './fields.ts';

export const DEFAULT_SUBMIT_TEXT = 'Submit';
export const DEFAULT_THANK_YOU = '<p>Thank you for reaching out, we’ll be in touch soon.</p>';

export const formType = defineContentType({
  name: 'cera_form',
  label: 'Form',
  boxes: {
    settings: {
      submitText: field.text({ label: 'Submit button text', note: `Default: “${DEFAULT_SUBMIT_TEXT}”.` }),
      privacyNote: field.html({ label: 'Privacy note', toolbar: 'limited', note: 'Shown above the button, e.g. how you use what people send, with a link to your privacy policy.' }),
    },
    onSubmit: {
      thankYouText: field.html({ label: 'Thank-you message', toolbar: 'limited', note: 'Shown in place of the form once it’s sent. Default: “Thank you for reaching out, we’ll be in touch soon.”' }),
      thankYouRedirect: field.url({ label: 'Thank-you page', note: 'Go to this page instead, e.g. /thank-you. Only addresses on this site.' }),
    },
    // Theme: the Submissions box. Private: recipients and routing never reach visitors.
    email: {
      to: field.textarea({ label: 'Email submissions to', note: 'Comma-separated email addresses. Also used when no route below matches.' }),
      routeBy: field.text({ label: 'Route by field', note: 'A field’s ID (its name in submissions), e.g. “department”. Its answer picks the addresses in Routes.' }),
      routes: field.repeater({
        label: 'Routes',
        itemTitle: 'value',
        fields: {
          value: field.text({ label: 'Answer', note: 'Exactly as the field’s option, e.g. “Sales”.' }),
          to: field.textarea({ label: 'Email addresses', note: 'Comma-separated.' }),
        },
      }),
      subject: field.text({ label: 'Email subject', note: 'Default: “Submission from <form name> form”.' }),
      confirmation: field.textarea({
        label: 'Confirmation email',
        note: 'Sent to the address the visitor entered (the first email field), at most once a day per address. Empty: no confirmation.',
      }),
    },
  },
  privateBoxes: ['email'],
  panels: formFields,
  editor: {
    icon: 'form',
    noun: 'form',
    itemNoun: 'field',
    titleLabel: 'Form name',
    slugLabel: 'Form ID',
    slugNote: 'Lowercase words joined by hyphens, e.g. “contact”. Submissions are listed under it.',
  },
});

export type FormType = typeof formType;
