/**
 * Form submissions as a CSV download: all of them, or one form's (?form=…).
 *
 *   // app/admin/submissions/export/route.ts
 *   export const { GET } = createSubmissionsExportHandler({
 *     client: async () => (await requireStaff('editor')).client,
 *   });
 *
 * Read with the signed-in user's client, so row-level security decides who
 * gets them: admins and editors.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { formType } from '../forms/form-type.ts';
import { submissionsCsv } from '../forms/csv.ts';
import { listSubmissions, type Submission } from '../supabase/forms.ts';
import { listPages } from '../supabase/index.ts';

export interface SubmissionsExportOptions {
  /**
   * The signed-in user's client. Check who they are here: throw, or call
   * Next's redirect(), to refuse. Called per request.
   */
  client: (request: Request) => SupabaseClient | Promise<SupabaseClient>;
  /** The forms' content type name, if the site renamed it. Default `cera_form`. */
  formType?: string;
  /** Today's date, for the file name. For tests. */
  now?: () => Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH = 500;

export function createSubmissionsExportHandler(options: SubmissionsExportOptions) {
  async function GET(request: Request): Promise<Response> {
    const client = await options.client(request);
    const formParameter = new URL(request.url).searchParams.get('form') ?? '';
    const formId = UUID.test(formParameter) ? formParameter : undefined;

    const forms = new Map((await listPages(client, { contentType: options.formType ?? formType.name })).map((form) => [form.id, form]));
    const all: Submission[] = [];
    for (let before: string | undefined; ; ) {
      const batch = await listSubmissions(client, { formId, before, limit: BATCH });
      all.push(...batch);
      if (batch.length < BATCH) break;
      before = batch[batch.length - 1]!.createdAt;
    }
    // Oldest first reads better in a spreadsheet.
    all.reverse();

    const csv = submissionsCsv(all.map((submission) => ({ ...submission, formTitle: forms.get(submission.formId)?.title ?? 'Deleted form' })));
    const date = (options.now?.() ?? new Date()).toISOString().slice(0, 10);
    const name = `${formId ? (forms.get(formId)?.slug ?? 'form') : 'all-forms'}-submissions-${date}.csv`;
    // The byte order mark tells Excel the file is UTF-8.
    return new Response(`﻿${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  return { GET };
}
