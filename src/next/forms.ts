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
 * Then `afterSubmit` runs (e.g. to send an email); its errors are logged.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { addSubmission, getLiveForm } from '../supabase/forms.ts';
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
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 100_000;
const HEADERS = { 'Cache-Control': 'no-store' };

const json = (body: FormResponse | { token: string } | { error: string }, status = 200) => Response.json(body, { status, headers: HEADERS });

export function defaultIp(request: Request): string | undefined {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || undefined;
}

export function createFormHandler(opts: FormHandlerOptions) {
  const ipOf = opts.ip ?? defaultIp;

  async function GET(request: Request): Promise<Response> {
    const formId = new URL(request.url).searchParams.get('form') ?? '';
    if (!UUID.test(formId)) return json({ error: 'Unknown form.' }, 400);
    return json({ token: issueFormToken(opts.secret(), formId) });
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
      const v = body.get(name);
      return typeof v === 'string' ? v : '';
    };
    const formId = text(FORM_ID_FIELD);
    if (!UUID.test(formId)) return bad('The form couldn’t be read. Reload the page and try again.');

    // A bot filled the field people never see: pretend it worked.
    if (text(HONEYPOT_FIELD)) return json({ ok: true });

    const secret = opts.secret();
    const token = checkFormToken(secret, formId, text(TOKEN_FIELD));
    if (token === 'too-fast') return json({ ok: false, reason: 'too-fast', message: 'That was very quick. Wait a moment, then send the form again.' }, 429);
    if (token === 'expired') {
      return json({ ok: false, reason: 'expired', message: 'This form was open a long time. Please send it again.', token: issueFormToken(secret, formId, Date.now() - 60_000) }, 409);
    }
    if (token === 'invalid') return bad('The form couldn’t be checked. Reload the page and try again.', 403);

    const client = opts.client();
    const form = await getLiveForm(client, formId);
    if (!form) return json({ ok: false, reason: 'not-live', message: 'This form isn’t taking submissions right now.' }, 404);

    const check = checkSubmission(form, (name) => body.getAll(name).filter((v): v is string => typeof v === 'string'));
    if (!check.ok) {
      const count = Object.keys(check.errors).length;
      return json({ ok: false, reason: 'invalid', message: count === 1 ? 'One answer needs fixing.' : `${count} answers need fixing.`, errors: check.errors }, 422);
    }

    const pagePath = text(PAGE_FIELD);
    const stored = await addSubmission(
      client,
      { form, values: check.values, email: check.email, pagePath: pagePath.startsWith('/') ? pagePath : undefined, senderKey: senderKey(secret, ipOf(request)) },
      opts.limit,
    );
    if (!stored.ok) {
      return stored.reason === 'rate-limited'
        ? json({ ok: false, reason: 'rate-limited', message: 'Too many submissions from this connection. Please try again in a few minutes.' }, 429)
        : json({ ok: false, reason: 'not-live', message: 'This form changed while you were filling it in. Reload the page and send it again.' }, 409);
    }

    if (opts.afterSubmit) {
      try {
        await opts.afterSubmit({ id: stored.id, form, values: check.values, email: check.email });
      } catch (e) {
        console.error(`cera: afterSubmit failed for submission ${stored.id}`, e);
      }
    }
    return json({ ok: true });
  }

  return { GET, POST };
}
