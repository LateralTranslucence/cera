// Preview from the admin: the signed-in session is the authorization, so the
// preview secret never reaches the browser. (/api/draft?secret=… is for outside tools.)
import { createPreviewHandler } from '@lateraltranslucence/cera/next';
import { requireStaff } from '@/lib/auth.ts';

export const { GET } = createPreviewHandler({ authorize: async () => Boolean(await requireStaff()) });
