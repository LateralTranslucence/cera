// The Search panel's endpoint (createSearchHandler): live pages for visitors,
// working copies in draft-mode preview. Live results are cached like live
// pages and cleared on publish.
import { draftMode } from 'next/headers';
import { createSearchHandler } from '@lateraltranslucence/cera/next';
import { cacheLive } from '@lateraltranslucence/cera/next/cache';
import { contentTypes } from '@/cera';
import { publicClient, serviceClient } from '@/lib/supabase.ts';

export const { GET } = createSearchHandler({
  client: publicClient,
  draftClient: serviceClient,
  isDraft: async () => (await draftMode()).isEnabled,
  contentTypes,
  cache: (key, run) => cacheLive(`search:${key}`, run)(),
});
