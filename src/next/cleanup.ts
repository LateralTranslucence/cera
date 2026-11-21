/**
 * Daily upkeep, as a route handler for a scheduler such as Vercel Cron:
 * removes uploads that never finished and replaced files nothing uses any
 * more (cleanUpUploads), and prunes old draft revisions (pruneRevisions; the
 * database also does this itself where pg_cron runs).
 *
 *   // app/api/cera/cleanup/route.ts
 *   export const { GET } = createCleanupHandler({ client: serviceClient, secret: () => process.env.CRON_SECRET });
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Without a secret
 * set, every request is refused.
 */
import { timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanUpUploads } from '../supabase/media.ts';
import { pruneRevisions } from '../supabase/index.ts';

export interface CleanupHandlerOptions {
  /** The secret-key client. */
  client: () => SupabaseClient;
  /** The shared secret the scheduler sends as a bearer token. */
  secret: () => string | undefined;
  /** Uploads younger than this are left alone (one may still be finishing). Default 24. */
  uploadsOlderThanHours?: number;
  /** Draft revisions kept per page, and how old the rest must be to go. Defaults 50 and 30. */
  revisions?: { keep?: number; olderThanDays?: number };
}

function bearerMatches(request: Request, secret: string | undefined): boolean {
  const given = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!secret || !given) return false;
  const givenBytes = Buffer.from(given);
  const expectedBytes = Buffer.from(secret);
  return givenBytes.length === expectedBytes.length && timingSafeEqual(givenBytes, expectedBytes);
}

export function createCleanupHandler(options: CleanupHandlerOptions) {
  async function GET(request: Request): Promise<Response> {
    if (!bearerMatches(request, options.secret())) return new Response('Not allowed.', { status: 401 });
    const client = options.client();
    const removed = await cleanUpUploads(client, { olderThanHours: options.uploadsOlderThanHours });
    const pruned = await pruneRevisions(client, options.revisions);
    return Response.json({ removedUploads: removed.length, prunedRevisions: pruned }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return { GET };
}
