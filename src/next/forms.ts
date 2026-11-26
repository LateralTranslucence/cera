/**
 * The endpoint forms post to, as a Next.js route handler:
 *
 *   // app/api/cera/forms/route.ts
 *   export const { GET, POST } = createFormHandler({ client: serviceClient, secret: () => process.env.… });
 *
 * GET ?form=<id> gives the browser a token when a form appears. POST takes
 * the form (multipart or urlencoded) and answers with a `FormResponse`:
 *   1. honeypot filled → a fake success (nothing stored);
 *   2. token missing, forged, under a few seconds old or over a day old → refused
 *      (an old one comes back with a fresh token, so the visitor can send again);
 *   3. the form must be live; answers are checked against that version;
 *   4. stored, unless this sender (a keyed hash of the IP address) already
 *      had `limit.max` accepted within `limit.minutes` (default 5 in 10).
 * Then `afterSubmit` runs; its errors are logged.
 *
 * Emails: after the response has gone (Next's after()), the form's private
 * Email box (its live version) decides what to send (buildFormEmails), and
 * `sendEmails` sends it, however the site likes (SMTP, an email API…).
 * Without `sendEmails` the emails are logged and skipped. A failure is
 * logged; the submission is already stored.
 *
 * createCera (cera.tsx) sets this up for a site; use it directly only to
 * build an admin by hand.
 */
import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildFormEmails, type FormEmail, type FormEmailSettings } from '../forms/email.ts';
import { addSubmission, claimConfirmation, getLiveForm } from '../supabase/forms.ts';
import { getPrivateBoxes } from '../supabase/index.ts';
import { checkSubmission, FORM_ID_FIELD, HONEYPOT_FIELD, PAGE_FIELD, TOKEN_FIELD, type FormResponse, type PublicForm, type SubmissionValue } from '../forms/model.ts';
import { checkFormToken, issueFormToken, senderKey } from '../forms/server.ts';

export interface FormHandlerOptions {
  /** A service-role client (stores submissions). Called per request. */
  client: () => SupabaseClient;
  /** A server-only secret for tokens and sender keys, e.g. the Supabase secret key. */
  secret: () => string;
  /** The visitor's IP address. Default: the first x-forwarded-for entry, else x-real-ip. */
  ip?: (request: Request) => string | undefined;
  /** Accepted submissions per sender per window. Default 5 per 10 minutes. */
  limit?: { max: number; minutes: number };
  /** After a submission is stored. */
  afterSubmit?: (submission: { id: string; form: PublicForm; values: SubmissionValue[]; email?: string }) => void | Promise<void>;
  /**
   * Sends a submission's emails: the alert to the routed addresses and, when
   * the form has one, the confirmation to the visitor. Change, add or drop
   * them first if you like. Without it, emails are logged and skipped.
   */
  sendEmails?: (emails: FormEmail[], submission: { id: string; form: PublicForm; values: SubmissionValue[]; email?: string }) => void | Promise<void>;
  /** Confirmations per address and across the site. Defaults: one a day per address, 50 an hour. */
  confirmations?: { perAddressHours?: number; hourlyMax?: number };
  /** Runs work after the response has gone. Default: Next's after(), or straight away outside a Next request. */
  defer?: (task: () => Promise<void>) => void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 100_000;
const HEADERS = { 'Cache-Control': 'no-store' };

const json = (body: FormResponse | { token: string } | { error: string }, status = 200) => Response.json(body, { status, headers: HEADERS });

/** Next's after(): the task runs once the response has gone. Outside a Next request (a script, a test), it runs now. */
function deferAfterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

export function defaultIp(request: Request): string | undefined {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || undefined;
}

export function createFormHandler(options: FormHandlerOptions) {
  const ipOf = options.ip ?? defaultIp;

  async function GET(request: Request): Promise<Response> {
    const formId = new URL(request.url).searchParams.get('form') ?? '';
    if (!UUID.test(formId)) return json({ error: 'Unknown form.' }, 400);
    return json({ token: issueFormToken(options.secret(), formId) });
  }

  async function POST(request: Request): Promise<Response> {
    const bad = (message: string, status = 400) => json({ ok: false, reason: 'bad-request', message }, status);
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return bad('That’s too much to send. Shorten your answers and try again.', 413);

    let body: FormData;
    try {
      body = await request.formData();
    } catch {
      return bad('The form couldn’t be read. Reload the page and try again.');
    }
    const text = (name: string) => {
      const value = body.get(name);
      return typeof value === 'string' ? value : '';
    };
    const formId = text(FORM_ID_FIELD);
    if (!UUID.test(formId)) return bad('The form couldn’t be read. Reload the page and try again.');

    // A bot filled the field people never see: pretend it worked.
    if (text(HONEYPOT_FIELD)) return json({ ok: true });

    const secret = options.secret();
    const token = checkFormToken(secret, formId, text(TOKEN_FIELD));
    if (token === 'too-fast') return json({ ok: false, reason: 'too-fast', message: 'That was very quick. Wait a moment, then send the form again.' }, 429);
    if (token === 'expired') {
      return json({ ok: false, reason: 'expired', message: 'This form was open a long time. Please send it again.', token: issueFormToken(secret, formId, Date.now() - 60_000) }, 409);
    }
    if (token === 'invalid') return bad('The form couldn’t be checked. Reload the page and try again.', 403);

    const client = options.client();
    const form = await getLiveForm(client, formId);
    if (!form) return json({ ok: false, reason: 'not-live', message: 'This form isn’t taking submissions right now.' }, 404);

    const check = checkSubmission(form, (name) => body.getAll(name).filter((value): value is string => typeof value === 'string'));
    if (!check.ok) {
      const count = Object.keys(check.errors).length;
      return json({ ok: false, reason: 'invalid', message: count === 1 ? 'One answer needs fixing.' : `${count} answers need fixing.`, errors: check.errors }, 422);
    }

    const pagePath = text(PAGE_FIELD);
    const stored = await addSubmission(
      client,
      { form, values: check.values, email: check.email, pagePath: pagePath.startsWith('/') ? pagePath : undefined, senderKey: senderKey(secret, ipOf(request)) },
      options.limit,
    );
    if (!stored.ok) {
      return stored.reason === 'rate-limited'
        ? json({ ok: false, reason: 'rate-limited', message: 'Too many submissions from this connection. Please try again in a few minutes.' }, 429)
        : json({ ok: false, reason: 'not-live', message: 'This form changed while you were filling it in. Reload the page and send it again.' }, 409);
    }

    const submission = { id: stored.id, form, values: check.values, email: check.email };
    if (options.afterSubmit) {
      try {
        await options.afterSubmit(submission);
      } catch (error) {
        console.error(`cera: afterSubmit failed for submission ${stored.id}`, error);
      }
    }
    (options.defer ?? deferAfterResponse)(() => sendSubmissionEmails(client, submission));
    return json({ ok: true });
  }

  /** Builds and sends a stored submission's emails. Never throws: the submission is already saved. */
  async function sendSubmissionEmails(client: SupabaseClient, submission: { id: string; form: PublicForm; values: SubmissionValue[]; email?: string }): Promise<void> {
    try {
      const settings = ((await getPrivateBoxes(client, submission.form.id))?.email ?? {}) as FormEmailSettings;
      const wantsConfirmation = Boolean(settings.confirmation?.trim() && submission.email && options.sendEmails);
      // A failed check skips only the confirmation: the alert still goes.
      const confirmationAllowed = wantsConfirmation
        ? await claimConfirmation(client, submission.id, options.confirmations).catch((error: unknown) => {
            console.error(`cera: couldn’t check the confirmation for submission ${submission.id}; not sending it`, error);
            return false;
          })
        : false;
      const emails = buildFormEmails({ formTitle: submission.form.title, settings, values: submission.values, email: submission.email, confirmationAllowed });
      if (emails.length === 0) return;
      if (!options.sendEmails) {
        console.info(`cera: submission ${submission.id} has ${emails.length} email(s) to send, but the form handler has no sendEmails.`);
        return;
      }
      await options.sendEmails(emails, submission);
    } catch (error) {
      console.error(`cera: emails for submission ${submission.id} failed`, error);
    }
  }

  return { GET, POST };
}
