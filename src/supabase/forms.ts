/**
 * Forms: reading a form for the page it's on, storing what visitors send,
 * and reading and deleting submissions in the admin.
 *
 * Which client to pass:
 *   - getLiveForm / createFormResolver (live): any client.
 *   - getDraftForm / createFormResolver (draft): a staff or service-role client.
 *   - addSubmission / deleteSubmissions: service-role client, on the server.
 *   - listSubmissions / submissionCounts: a client signed in as an admin or
 *     editor (row-level security; others get nothing).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { readPage, type StoredPage } from '../document.ts';
import { formType } from '../forms/form-type.ts';
import { publicForm, type PublicForm, type SubmissionValue } from '../forms/model.ts';
import type { FormResolver } from '../panel.ts';
import { fail } from './errors.ts';

const COLUMNS = 'content_type, slug, title, boxes, panels';
type Row = { content_type: string; slug: string; title: string; boxes: StoredPage['boxes']; panels: StoredPage['panels'] };

function toForm(id: string, row: Row, version: number, status: 'published' | 'draft'): PublicForm {
  const stored: StoredPage = { id, contentType: row.content_type, slug: row.slug, title: row.title, boxes: row.boxes, panels: row.panels };
  return publicForm(readPage(formType, stored, { status }).page, version);
}

/** The live version of a form, or null if it isn't published. */
export async function getLiveForm(client: SupabaseClient, formId: string): Promise<PublicForm | null> {
  if (!UUID.test(formId)) return null;
  const { data, error } = await client
    .from('cera_page_revisions')
    .select(`page_version, ${COLUMNS}`)
    .eq('page_id', formId)
    .eq('content_type', formType.name)
    .eq('is_published', true)
    .maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const row = data as Row & { page_version: number };
  return toForm(formId, row, row.page_version, 'published');
}

/** A form's working copy, for draft-mode preview. */
export async function getDraftForm(client: SupabaseClient, formId: string): Promise<PublicForm | null> {
  if (!UUID.test(formId)) return null;
  const { data, error } = await client.from('cera_pages').select(`version, ${COLUMNS}`).eq('id', formId).eq('content_type', formType.name).maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const row = data as Row & { version: number };
  return toForm(formId, row, row.version, 'draft');
}

/**
 * How a Form panel finds its form (pass it as `loadContext.forms`): the live
 * version normally, the working copy in draft-mode preview. `endpoint` is
 * where the form posts (see `createFormHandler` in `cera/next`).
 */
export function createFormResolver(client: SupabaseClient, opts: { draft: boolean; endpoint?: string }): FormResolver {
  return {
    endpoint: opts.endpoint ?? DEFAULT_FORM_ENDPOINT,
    byId: (id) => (opts.draft ? getDraftForm(client, id) : getLiveForm(client, id)),
  };
}

export const DEFAULT_FORM_ENDPOINT = '/api/cera/forms';

export type AddSubmissionResult = { ok: true; id: string } | { ok: false; reason: 'not-live' | 'rate-limited' };

/**
 * Stores a submission already checked with `checkSubmission` against `form`
 * (the live version). Refused when that version is no longer live, or when
 * this sender has had `limit.max` accepted within `limit.minutes`.
 * Service-role client only.
 */
export async function addSubmission(
  client: SupabaseClient,
  input: { form: Pick<PublicForm, 'id' | 'version'>; values: SubmissionValue[]; email?: string; pagePath?: string; senderKey: string },
  limit: { max: number; minutes: number } = { max: 5, minutes: 10 },
): Promise<AddSubmissionResult> {
  const { data, error } = await client.rpc('cera_add_submission', {
    p_form_id: input.form.id,
    p_version: input.form.version,
    p_data: input.values,
    p_email: input.email ?? null,
    p_page_path: input.pagePath?.slice(0, 500) ?? null,
    p_sender_key: input.senderKey,
    p_max: limit.max,
    p_window: `${limit.minutes} minutes`,
  });
  if (error) {
    if (error.code === 'CE404') return { ok: false, reason: 'not-live' };
    if (error.code === 'CE429') return { ok: false, reason: 'rate-limited' };
    fail(error);
  }
  return { ok: true, id: data as string };
}

export interface Submission {
  id: string;
  formId: string;
  formVersion: number;
  values: SubmissionValue[];
  email?: string;
  pagePath?: string;
  createdAt: string;
}

type SubmissionRow = { id: string; form_id: string; form_version: number; data: SubmissionValue[]; email: string | null; page_path: string | null; created_at: string };

/** Submissions newest first, for one form or all, `limit` at a time (default 50), older than `before` (a `createdAt`). */
export async function listSubmissions(client: SupabaseClient, opts: { formId?: string; before?: string; limit?: number } = {}): Promise<Submission[]> {
  const { data, error } = await client.rpc('cera_list_submissions', { p_form_id: opts.formId ?? null, p_before: opts.before ?? null, p_limit: opts.limit ?? 50 });
  if (error) fail(error);
  return ((data as SubmissionRow[] | null) ?? []).map((row) => ({
    id: row.id,
    formId: row.form_id,
    formVersion: row.form_version,
    values: row.data,
    ...(row.email && { email: row.email }),
    ...(row.page_path && { pagePath: row.page_path }),
    createdAt: row.created_at,
  }));
}

/** How many submissions each form has, and the newest one's time. */
export async function submissionCounts(client: SupabaseClient): Promise<Map<string, { total: number; latest: string }>> {
  const { data, error } = await client.rpc('cera_submission_counts');
  if (error) fail(error);
  return new Map(((data as Array<{ form_id: string; total: number; latest: string }> | null) ?? []).map((row) => [row.form_id, { total: row.total, latest: row.latest }]));
}

/**
 * Deletes submissions: the given `ids` (within `formId`, when given), or all
 * of `formId`'s. Returns how many went. Service-role client only; the
 * database checks that `userId` is an admin or editor.
 */
export async function deleteSubmissions(client: SupabaseClient, opts: { ids?: string[]; formId?: string; userId: string }): Promise<number> {
  const { data, error } = await client.rpc('cera_delete_submissions', { p_ids: opts.ids ?? null, p_form_id: opts.formId ?? null, p_user: opts.userId });
  if (error) fail(error);
  return Number(data ?? 0);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
