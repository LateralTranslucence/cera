// Preview for outside tools: /api/draft?secret=…&slug=about.
import { createPreviewHandler, previewSecret } from '@lateraltranslucence/cera/next';

export const { GET } = createPreviewHandler({ authorize: previewSecret(() => process.env.CERA_PREVIEW_SECRET) });
