/**
 * Anti-spam pieces that need the site's secret: server only.
 *
 * The token proves the form was opened at least MIN_FILL_MILLISECONDS before
 * it was sent (bots post at once) and at most MAX_AGE_MILLISECONDS ago, and
 * only for that form.
 * The sender key is a keyed hash of the visitor's IP address, so rate limits
 * work without storing addresses.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const MIN_FILL_MILLISECONDS = 3_000;
export const MAX_AGE_MILLISECONDS = 24 * 60 * 60 * 1000;

function sign(secret: string, purpose: string, text: string): string {
  return createHmac('sha256', `cera-forms:${purpose}:${secret}`).update(text).digest('base64url');
}

/** A token for `formId`, issued now. */
export function issueFormToken(secret: string, formId: string, now = Date.now()): string {
  return `${now}.${sign(secret, 'token', `${formId}.${now}`)}`;
}

export type TokenCheck = 'ok' | 'too-fast' | 'expired' | 'invalid';

export function checkFormToken(secret: string, formId: string, token: string, now = Date.now()): TokenCheck {
  const [timestamp, signature] = token.split('.');
  if (!timestamp || !signature || !/^\d{1,16}$/.test(timestamp)) return 'invalid';
  const expected = Buffer.from(sign(secret, 'token', `${formId}.${timestamp}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return 'invalid';
  const age = now - Number(timestamp);
  if (age < MIN_FILL_MILLISECONDS) return 'too-fast';
  if (age > MAX_AGE_MILLISECONDS) return 'expired';
  return 'ok';
}

/** A stable, non-reversible key for an IP address. */
export function senderKey(secret: string, ip: string | undefined): string {
  return sign(secret, 'sender', ip?.trim() || 'unknown');
}
