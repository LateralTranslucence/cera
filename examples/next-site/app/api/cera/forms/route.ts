/**
 * Where forms post (see createFormHandler). Submissions are stored with the
 * secret key, which also keys the anti-spam token and the hashed sender
 * address used for the rate limit.
 */
import { createFormHandler } from '@lateraltranslucence/cera/next';
import { serviceClient } from '@/lib/supabase.ts';

export const { GET, POST } = createFormHandler({
  client: serviceClient,
  secret: () => {
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!key) throw new Error('Missing environment variable SUPABASE_SECRET_KEY. See .env.example.');
    return key;
  },
});
