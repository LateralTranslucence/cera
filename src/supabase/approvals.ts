/**
 * Approvals and their settings. Reading takes a staff client (row-level
 * security); saving, deciding and withdrawing take the service-role client,
 * on the server only, with a `userId` from a verified session. The database
 * checks that user's role and the settings itself.
 *
 * Submitting a page is `savePage` with `mode: 'submit'`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { NO_APPROVALS, parseApprovalSettings, type ApprovalEvent, type ApprovalSettings, type ApproverRole, type PageApproval, type PendingApproval } from '../approvals.ts';
import { isCeraRole } from '../roles.ts';
import { fail } from './errors.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMMENT_MAX = 2000;

/** A note or comment as stored: trimmed and at most 2,000 characters; null when empty. */
export function approvalComment(text: unknown): string | null {
  return (typeof text === 'string' ? text.trim().slice(0, COMMENT_MAX) : '') || null;
}

/** The site's approval settings, and the version to save over (0 when never saved). Staff or service-role client. */
export async function getApprovalSettings(client: SupabaseClient): Promise<{ settings: ApprovalSettings; version: number }> {
  const { data, error } = await client.from('cera_settings').select('value, version').eq('key', 'approvals').maybeSingle();
  if (error) fail(error);
  const row = data as { value: unknown; version: number } | null;
  return row ? { settings: parseApprovalSettings(row.value), version: row.version } : { settings: NO_APPROVALS, version: 0 };
}

export type SettingsResult = { ok: true; settings: ApprovalSettings; version: number } | { ok: false; reason: 'conflict' | 'forbidden'; message: string };

/** Saves the approval settings (admins only). */
export async function saveApprovalSettings(
  service: SupabaseClient,
  settings: ApprovalSettings,
  options: { expectedVersion: number; userId: string },
): Promise<SettingsResult> {
  const value = parseApprovalSettings(settings);
  const { data, error } = await service.rpc('cera_save_settings', { p_key: 'approvals', p_value: value, p_expected_version: options.expectedVersion, p_user: options.userId });
  if (error) {
    if (error.code === 'CE409') return { ok: false, reason: 'conflict', message: 'Someone else changed the settings after you opened them. Reload to see theirs.' };
    if (error.code === '42501') return { ok: false, reason: 'forbidden', message: 'Only admins can change the settings.' };
    fail(error);
  }
  return { ok: true, settings: value, version: (data as { version: number }).version };
}

type EventRow = { action: ApprovalEvent['action']; at: string; by: string | null; role: string | null; comment: string | null };

export function toApprovalEvents(rows: unknown): ApprovalEvent[] {
  return ((rows as EventRow[] | null) ?? []).map((row) => ({
    action: row.action,
    at: row.at,
    ...(row.by && { by: row.by }),
    ...(isCeraRole(row.role) && { role: row.role }),
    ...(row.comment && { comment: row.comment }),
  }));
}

const submitter = (id: string | null, email: string | null) => (id ? { submittedBy: { id, ...(email && { email }) } } : {});

/** A page's request: pending, or sent back and not yet answered. Null when there's none. Staff client. */
export async function getPageApproval(client: SupabaseClient, pageId: string): Promise<PageApproval | null> {
  const { data, error } = await client.rpc('cera_page_approval', { p_page_id: pageId });
  if (error) fail(error);
  const row = data as {
    id: string;
    status: PageApproval['status'];
    version: number;
    awaiting: ApproverRole | null;
    requestedFor: string | null;
    submittedAt: string;
    submittedBy: string | null;
    submittedByEmail: string | null;
    events: unknown;
  } | null;
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    version: row.version,
    ...(row.awaiting && { awaiting: row.awaiting }),
    ...(row.requestedFor && { requestedFor: row.requestedFor }),
    submittedAt: row.submittedAt,
    ...submitter(row.submittedBy, row.submittedByEmail),
    events: toApprovalEvents(row.events),
  };
}

/** Every pending request, oldest first. Staff client. */
export async function pendingApprovals(client: SupabaseClient): Promise<PendingApproval[]> {
  const { data, error } = await client.rpc('cera_pending_approvals');
  if (error) fail(error);
  type Row = {
    id: string;
    page_id: string;
    content_type: string;
    title: string;
    page_version: number;
    awaiting: ApproverRole;
    requested_for: string | null;
    submitted_at: string;
    submitted_by: string | null;
    submitted_by_email: string | null;
  };
  return ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id,
    pageId: row.page_id,
    contentType: row.content_type,
    title: row.title,
    version: row.page_version,
    awaiting: row.awaiting,
    ...(row.requested_for && { requestedFor: row.requested_for }),
    submittedAt: row.submitted_at,
    ...submitter(row.submitted_by, row.submitted_by_email),
  }));
}

/** The page a request is about, and the request's state. Staff client; null for an unknown request. */
export async function getApprovalPage(client: SupabaseClient, approvalId: string): Promise<{ pageId: string; contentType: string; submittedBy?: string } | null> {
  if (!UUID.test(String(approvalId ?? ''))) return null;
  const { data, error } = await client.from('cera_approvals').select('page_id, content_type, submitted_by').eq('id', approvalId).maybeSingle();
  if (error) fail(error);
  const row = data as { page_id: string; content_type: string; submitted_by: string | null } | null;
  return row && { pageId: row.page_id, contentType: row.content_type, ...(row.submitted_by && { submittedBy: row.submitted_by }) };
}

export interface ApprovalDecision {
  approvalId: string;
  decision: 'approve' | 'send_back';
  /** For the last approval: when the page goes live (an ISO time in the future). Without it, now. */
  publishAt?: string;
  comment?: string;
}

export type DecisionResult =
  /** `approved`: passed to the next tier. `published` and `scheduled`: that was the last approval. */
  | { ok: true; pageId: string; version: number; outcome: 'approved' | 'published' | 'scheduled' | 'sent_back' }
  /** `decided`: someone else decided it, it was withdrawn, or something newer replaced it. */
  | { ok: false; reason: 'decided' | 'forbidden' | 'not-found' | 'slug-taken' | 'bad-time'; message: string };

const FAILURES: Record<string, Extract<DecisionResult, { ok: false }>> = {
  CE409: { ok: false, reason: 'decided', message: 'This request was already decided, withdrawn or replaced. Reload to see where the page is now.' },
  CE423: { ok: false, reason: 'forbidden', message: 'Someone else has to approve this.' },
  '42501': { ok: false, reason: 'forbidden', message: 'Your role can’t approve pages.' },
  CE404: { ok: false, reason: 'not-found', message: 'This request no longer exists.' },
  '23505': { ok: false, reason: 'slug-taken', message: 'Another page is live at this address. Change one of the addresses first.' },
  CE400: { ok: false, reason: 'bad-time', message: 'Pick a time in the future.' },
};

/** Approves a request (passing it on, or publishing or scheduling the submitted version) or sends it back. */
export async function decideApproval(service: SupabaseClient, input: ApprovalDecision, options: { userId: string }): Promise<DecisionResult> {
  if (!UUID.test(String(input?.approvalId ?? ''))) return FAILURES.CE404!;
  const publishAt = input.publishAt ? new Date(input.publishAt) : null;
  if (publishAt && (Number.isNaN(publishAt.getTime()) || publishAt.getTime() <= Date.now())) return FAILURES.CE400!;
  const { data, error } = await service.rpc('cera_decide_approval', {
    p_approval_id: input.approvalId,
    p_decision: String(input.decision),
    p_publish_at: publishAt?.toISOString() ?? null,
    p_comment: approvalComment(input.comment),
    p_user: options.userId,
  });
  if (error) {
    const failure = error.code ? FAILURES[error.code] : undefined;
    if (failure) return failure;
    fail(error);
  }
  const decided = data as { pageId: string; version: number; outcome: Extract<DecisionResult, { ok: true }>['outcome'] };
  return { ok: true, ...decided };
}

/** Takes a request back. Only whoever submitted it. */
export async function withdrawApproval(service: SupabaseClient, approvalId: string, options: { userId: string }): Promise<{ ok: true } | Extract<DecisionResult, { ok: false }>> {
  if (!UUID.test(String(approvalId ?? ''))) return FAILURES.CE404!;
  const { error } = await service.rpc('cera_withdraw_approval', { p_approval_id: approvalId, p_user: options.userId });
  if (error) {
    if (error.code === '42501') return { ok: false, reason: 'forbidden', message: 'Only whoever submitted it can withdraw it.' };
    const failure = error.code ? FAILURES[error.code] : undefined;
    if (failure) return failure;
    fail(error);
  }
  return { ok: true };
}
