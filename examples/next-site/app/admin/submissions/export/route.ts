// Submissions as a CSV download: all of them, or one form's (?form=…). Read as
// the signed-in user, so row-level security applies: admins and editors only.
import { createSubmissionsExportHandler } from '@lateraltranslucence/cera/next';
import { requireStaff } from '@/lib/auth.ts';

export const { GET } = createSubmissionsExportHandler({ client: async () => (await requireStaff('editor')).client });
