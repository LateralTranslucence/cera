/**
 * Submissions as a CSV download: all of them, or one form's (?form=…).
 * Read as the signed-in user, so row-level security applies: admins and
 * editors only.
 */
import { submissionsCsv } from '@lateraltranslucence/cera/forms';
import { listPages, listSubmissions, type Submission } from '@lateraltranslucence/cera/supabase';
import { formType } from '@/cera';
import { requireStaff } from '@/lib/auth.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  const staff = await requireStaff('editor');
  const param = new URL(request.url).searchParams.get('form') ?? '';
  const formId = UUID.test(param) ? param : undefined;

  const forms = new Map((await listPages(staff.client, { contentType: formType.name })).map((form) => [form.id, form]));
  const all: Submission[] = [];
  for (let before: string | undefined; ; ) {
    const batch = await listSubmissions(staff.client, { formId, before, limit: 500 });
    all.push(...batch);
    if (batch.length < 500) break;
    before = batch[batch.length - 1]!.createdAt;
  }
  // Oldest first reads better in a spreadsheet.
  all.reverse();

  const csv = submissionsCsv(all.map((submission) => ({ ...submission, formTitle: forms.get(submission.formId)?.title ?? 'Deleted form' })));
  const name = `${formId ? (forms.get(formId)?.slug ?? 'form') : 'all-forms'}-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
