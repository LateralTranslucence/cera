// Leaves draft mode and goes back to the page (?path=/about).
import { createExitPreviewHandler } from '@lateraltranslucence/cera/next';

export const { GET } = createExitPreviewHandler();
