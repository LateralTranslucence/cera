/**
 * The emails a form submission sends (theme: the form route's alert and
 * confirmation), from the form's private Email box. Cera builds them; the
 * site sends them (createFormHandler's `sendEmails`).
 *
 *   - The alert goes to the addresses the routing picks: the route whose
 *     answer matches the "Route by field" field's answer, else "Email
 *     submissions to". No addresses: no alert. Reply-To is the visitor's
 *     address, when they gave one.
 *   - The confirmation goes to the visitor's address with the form's own
 *     text (never anything they sent), when the form has one and the
 *     database allows it (at most one per address per day, 50 an hour).
 */
import { EMAIL_PATTERN } from '../fields.ts';
import type { SubmissionValue } from './model.ts';

export interface FormEmail {
  kind: 'alert' | 'confirmation';
  to: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
}

/** The form's Email box, as stored. */
export interface FormEmailSettings {
  to?: string;
  routeBy?: string;
  routes?: Array<{ value?: string; to?: string }>;
  subject?: string;
  confirmation?: string;
}

/** Comma- (or line-, or semicolon-) separated addresses, valid ones only, without repeats. */
export function parseAddresses(text: string | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (text ?? '').split(/[,;\n]/)) {
    const address = part.trim();
    if (!address || !EMAIL_PATTERN.test(address) || address.length > 254 || seen.has(address.toLowerCase())) continue;
    seen.add(address.toLowerCase());
    out.push(address);
  }
  return out;
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const asText = (value: string | string[]) => (Array.isArray(value) ? value.join(', ') : value);

/** The addresses the alert goes to: the matching route's, else the form's default ones. */
export function alertRecipients(settings: FormEmailSettings, values: readonly SubmissionValue[]): string[] {
  const routeBy = settings.routeBy?.trim();
  if (routeBy) {
    const answer = values.find((value) => value.name === routeBy)?.value;
    const answers = (Array.isArray(answer) ? answer : [answer ?? '']).map((text) => text.trim()).filter(Boolean);
    for (const given of answers) {
      const route = settings.routes?.find((candidate) => candidate.value?.trim() === given);
      const routed = parseAddresses(route?.to);
      if (routed.length > 0) return routed;
    }
  }
  return parseAddresses(settings.to);
}

export function buildFormEmails(input: {
  /** The form's name. */
  formTitle: string;
  settings: FormEmailSettings;
  values: readonly SubmissionValue[];
  /** The visitor's address (the submission's first email answer). */
  email?: string;
  /** Whether a confirmation may go out now (see claimConfirmation). */
  confirmationAllowed: boolean;
}): FormEmail[] {
  const { formTitle, settings, values } = input;
  const subject = settings.subject?.trim();
  const emails: FormEmail[] = [];

  const to = alertRecipients(settings, values);
  if (to.length > 0) {
    const answered = values.filter((value) => asText(value.value).trim() !== '');
    emails.push({
      kind: 'alert',
      to,
      ...(input.email && { replyTo: input.email }),
      subject: subject || `Submission from ${formTitle} form`,
      text: answered.map((value) => `${value.label}: ${asText(value.value)}`).join('\n'),
      html: answered.map((value) => `<p><strong>${escapeHtml(value.label)}:</strong> ${escapeHtml(asText(value.value)).replace(/\n/g, '<br>')}</p>`).join('\n'),
    });
  }

  const confirmation = settings.confirmation?.trim();
  if (confirmation && input.email && input.confirmationAllowed) {
    emails.push({
      kind: 'confirmation',
      to: [input.email],
      subject: subject || `Submission of ${formTitle} form`,
      text: confirmation,
      html: confirmation
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
        .join('\n'),
    });
  }
  return emails;
}
