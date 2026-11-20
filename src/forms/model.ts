/**
 * Forms as visitors see them, and checking what they send. Safe for the
 * browser: no secrets here (see server.ts for the anti-spam token).
 */
import { slugForId } from '../panels/slug.ts';
import type { PageOf } from '../content-type.ts';
import { DEFAULT_SUBMIT_TEXT, DEFAULT_THANK_YOU, type FormType } from './form-type.ts';

export type FormFieldType = 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'radio' | 'button-select' | 'checkbox' | 'binary' | 'toggle' | 'range' | 'hidden';

export interface FormOption {
  label: string;
  value: string;
  description?: string;
}

export interface FormField {
  type: FormFieldType;
  /** Unique within the form; the answer is saved under it. */
  name: string;
  label: string;
  required: boolean;
  hideLabel: boolean;
  note?: string;
  /** text: an HTML autocomplete token. */
  autocomplete?: string;
  /** select, radio, button-select, checkbox. */
  options?: FormOption[];
  /** range. */
  min?: number;
  max?: number;
  step?: number;
  /** toggle: the answers for off and on. */
  offLabel?: string;
  onLabel?: string;
  /** hidden: the value, and a query parameter that can fill it instead. */
  value?: string;
  fromQuery?: string;
}

export interface FormSection {
  type: 'section';
  legend: string;
  note?: string;
  fields: FormField[];
}

export type FormItem = FormField | FormSection;

/** A form as the browser gets it. */
export interface PublicForm {
  id: string;
  slug: string;
  title: string;
  /** The saved version this was read from; submissions record it. */
  version: number;
  submitText: string;
  /** Sanitized HTML. */
  privacyNote?: string;
  /** Sanitized HTML. */
  thankYouText: string;
  /** An internal path, when set. */
  thankYouRedirect?: string;
  items: FormItem[];
}

/** Names the form itself sends; fields can't use them. */
export const FORM_ID_FIELD = 'cera-form';
export const TOKEN_FIELD = 'cera-token';
export const HONEYPOT_FIELD = 'cera-website';
export const PAGE_FIELD = 'cera-page';
const RESERVED = new Set([FORM_ID_FIELD, TOKEN_FIELD, HONEYPOT_FIELD, PAGE_FIELD]);

/** The longest answer kept, per field type. */
export const MAX_LENGTH: Partial<Record<FormFieldType, number>> = { text: 500, email: 254, phone: 40, textarea: 10_000, hidden: 500 };

const TYPES: Record<string, FormFieldType> = {
  'cera/field-text': 'text',
  'cera/field-email': 'email',
  'cera/field-phone': 'phone',
  'cera/field-textarea': 'textarea',
  'cera/field-select': 'select',
  'cera/field-radio': 'radio',
  'cera/field-button-select': 'button-select',
  'cera/field-checkbox': 'checkbox',
  'cera/field-binary': 'binary',
  'cera/field-toggle': 'toggle',
  'cera/field-range': 'range',
  'cera/field-hidden': 'hidden',
};

const clean = (s: unknown) => (typeof s === 'string' ? s.trim() : '');

/** Only paths on this site: "/thank-you", not "//evil.example" or "https://…". */
export function internalPath(url: string | undefined): string | undefined {
  const u = clean(url);
  return /^\/(?!\/)/.test(u) && !/[\s\\]/.test(u) ? u : undefined;
}

/**
 * The form a visitor sees: fields that aren't hidden, in order, grouped by
 * sections, each with a unique name. `version` is the revision it came from.
 */
export function publicForm(page: PageOf<FormType>, version: number): PublicForm {
  const items: FormItem[] = [];
  let section: FormSection | null = null;
  const used = new Set<string>();
  let n = 0;

  for (const panel of page.panels) {
    if (panel.hidden) continue;
    const d = panel.data as Record<string, unknown>;
    if (panel.type === 'cera/field-section') {
      const legend = clean(d.legend);
      section = legend ? { type: 'section', legend, ...(clean(d.note) && { note: clean(d.note) }), fields: [] } : null;
      if (section) items.push(section);
      continue;
    }
    const type = TYPES[panel.type];
    if (!type) continue;
    n++;

    const label = clean(d.label) || `Field ${n}`;
    const base = slugForId(clean(d.name) || label) || `field-${n}`;
    let name = base;
    for (let i = 2; RESERVED.has(name) || used.has(name); i++) name = `${base}-${i}`;
    used.add(name);

    const field: FormField = {
      type,
      name,
      label,
      required: type !== 'hidden' && type !== 'range' && d.required === true,
      hideLabel: d.hideLabel === true,
      ...(clean(d.note) && { note: clean(d.note) }),
    };
    if (type === 'text' && typeof d.autocomplete === 'string' && d.autocomplete !== 'none') field.autocomplete = d.autocomplete;
    if (Array.isArray(d.options)) {
      const seen = new Set<string>();
      field.options = [];
      for (const o of d.options as Array<Record<string, unknown>>) {
        const optLabel = clean(o.label);
        const value = clean(o.value) || optLabel;
        if (!value || seen.has(value)) continue;
        seen.add(value);
        field.options.push({ label: optLabel || value, value, ...(clean(o.description) && { description: clean(o.description) }) });
      }
    }
    if (type === 'range') {
      const int = (v: unknown, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1e9, Math.min(1e9, Math.round(v))) : dflt);
      const min = int(d.min, 0);
      field.min = min;
      field.max = Math.max(min, int(d.max, 100));
      field.step = Math.max(1, int(d.step, 1));
    }
    if (type === 'toggle') {
      field.offLabel = clean(d.offLabel) || 'No';
      field.onLabel = clean(d.onLabel) || 'Yes';
    }
    if (type === 'hidden') {
      if (clean(d.value)) field.value = clean(d.value);
      if (clean(d.fromQuery)) field.fromQuery = clean(d.fromQuery);
    }

    if (section) section.fields.push(field);
    else items.push(field);
  }

  const settings = page.boxes.settings;
  const onSubmit = page.boxes.onSubmit;
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    version,
    submitText: clean(settings.submitText) || DEFAULT_SUBMIT_TEXT,
    ...(clean(settings.privacyNote) && { privacyNote: settings.privacyNote }),
    thankYouText: clean(onSubmit.thankYouText) || DEFAULT_THANK_YOU,
    ...(internalPath(onSubmit.thankYouRedirect) && { thankYouRedirect: internalPath(onSubmit.thankYouRedirect) }),
    items,
  };
}

/** Every field, sections flattened. */
export function formFieldList(form: Pick<PublicForm, 'items'>): FormField[] {
  return form.items.flatMap((i) => (i.type === 'section' ? i.fields : [i]));
}

/** One answer as stored: in form order, with the label it had when sent. */
export interface SubmissionValue {
  name: string;
  label: string;
  value: string | string[];
}

export type SubmissionCheck =
  | { ok: true; values: SubmissionValue[]; /** The first valid email address, for the submissions list. */ email?: string }
  | { ok: false; /** By field name. */ errors: Record<string, string> };

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;
const PHONE = /^[0-9+().\-\s]*[0-9][0-9+().\-\s]*$/;

/** Plain text: no control characters (tabs and, in a text area, line breaks are kept). */
function plain(value: string, multiline: boolean): string {
  const v = value.replace(/\r\n?/g, '\n');
  // eslint-disable-next-line no-control-regex
  return (multiline ? v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '') : v.replace(/[\u0000-\u0008\u000A-\u001F\u007F]/g, ' ')).trim();
}

/**
 * Checks a submission against the form: required answers, formats, and that
 * choices are among the options. `get(name)` returns every value sent under
 * a name (several for checkboxes). Extra names are ignored.
 */
export function checkSubmission(form: Pick<PublicForm, 'items'>, get: (name: string) => string[]): SubmissionCheck {
  const errors: Record<string, string> = {};
  const values: SubmissionValue[] = [];
  let email: string | undefined;

  for (const field of formFieldList(form)) {
    const sent = get(field.name).filter((v) => typeof v === 'string');
    const first = plain(sent[0] ?? '', field.type === 'textarea');
    const max = MAX_LENGTH[field.type];
    const fail = (message: string) => {
      errors[field.name] = message;
    };
    const missing = () => fail(`${field.label} is required.`);
    let value: string | string[] = first;

    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'hidden':
        if (field.required && !first) missing();
        break;
      case 'email':
        if (!first) {
          if (field.required) missing();
        } else if (!EMAIL.test(first) || first.length > 254) fail('Enter an email address like name@example.com.');
        else email ??= first;
        break;
      case 'phone':
        if (!first) {
          if (field.required) missing();
        } else if (!PHONE.test(first)) fail('Enter a phone number using digits, spaces and + ( ) - .');
        break;
      case 'select':
      case 'radio':
      case 'button-select':
        if (!first) {
          if (field.required) missing();
        } else if (!field.options?.some((o) => o.value === first)) fail('Choose one of the options.');
        break;
      case 'checkbox': {
        const picked = [...new Set(sent.map((v) => v.trim()).filter(Boolean))];
        if (picked.some((v) => !field.options?.some((o) => o.value === v))) fail('Choose from the options.');
        else if (field.required && picked.length === 0) missing();
        // Stored in the options' order.
        value = (field.options ?? []).map((o) => o.value).filter((v) => picked.includes(v));
        break;
      }
      case 'binary':
        if (first && first !== 'yes') fail('Tick the box or leave it empty.');
        else if (field.required && !first) missing();
        value = first ? 'Yes' : 'No';
        break;
      case 'toggle':
        // The switch sends "on" when on and nothing when off.
        if (first && first !== 'on') fail('Turn the switch on or off.');
        else if (field.required && !first) missing();
        value = first ? field.onLabel! : field.offLabel!;
        break;
      case 'range': {
        const n = Number(first);
        const min = field.min ?? 0;
        const max = field.max ?? 100;
        const step = field.step ?? 1;
        if (!/^-?\d+$/.test(first) || n < min || n > max || (n - min) % step !== 0) fail(`Choose a number from ${min} to ${max}.`);
        break;
      }
    }
    if (typeof value === 'string' && max && value.length > max) fail(`Use at most ${max.toLocaleString('en-US')} characters.`);
    values.push({ name: field.name, label: field.label, value });
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, values, ...(email && { email }) };
}

/** What the form endpoint answers (see `createFormHandler` in `cera/next`). */
export type FormResponse =
  | { ok: true }
  | { ok: false; reason: 'invalid'; message: string; /** By field name. */ errors: Record<string, string> }
  /** `expired` comes with a fresh `token`: send again with it. */
  | { ok: false; reason: 'too-fast' | 'expired' | 'rate-limited' | 'not-live' | 'bad-request'; message: string; token?: string };
