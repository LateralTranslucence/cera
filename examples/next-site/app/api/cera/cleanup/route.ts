// Daily upkeep, run by Vercel Cron (vercel.json): removes unfinished and
// replaced uploads nothing uses, and prunes old draft revisions.
import { createCleanupHandler } from '@lateraltranslucence/cera/next';
import { serviceClient } from '@/lib/supabase.ts';

export const { GET } = createCleanupHandler({ client: serviceClient, secret: () => process.env.CRON_SECRET });
