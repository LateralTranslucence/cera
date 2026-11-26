/**
 * Approving pages before they go live: the settings, and what each role may
 * do under them. Shared by the server helpers and the admin. The database
 * checks the same rules itself (the cera_approvals migration), so this
 * decides what the admin offers, not what's allowed.
 *
 * A content type has no approval, one tier or two. An approval counts for
 * every tier up to the approver's role, so an admin's is always the last one
 * needed. Whoever could give the last approval publishes without asking,
 * unless `someoneElse` is on.
 */
import { canEditContentType, roleAtLeast, type CeraRole } from './roles.ts';

/** The roles that can approve. */
export type ApproverRole = 'editor' | 'admin';

/** A content type's tiers, lowest first; empty for no approval. */
export type ApprovalTiers = readonly ApproverRole[];

export interface ApprovalSettings {
  /** Tiers by content type name. A type that isn't listed needs no approval. */
  tiers: Record<string, ApproverRole[]>;
  /** Nobody approves or publishes their own pages, on types with approval. */
  someoneElse: boolean;
}

export const NO_APPROVALS: ApprovalSettings = { tiers: {}, someoneElse: false };

/** The workflows a content type can have. */
export const APPROVAL_WORKFLOWS: ReadonlyArray<{ id: string; tiers: ApprovalTiers; label: string; note: string }> = [
  { id: 'none', tiers: [], label: 'No approval', note: 'Editors and admins publish. Authors save drafts for them.' },
  { id: 'editor', tiers: ['editor'], label: 'One tier: editors', note: 'Authors submit. An editor or admin approves. Editors and admins publish their own pages.' },
  { id: 'admin', tiers: ['admin'], label: 'One tier: admins', note: 'Authors and editors submit. An admin approves.' },
  { id: 'editor-admin', tiers: ['editor', 'admin'], label: 'Two tiers: editors, then admins', note: 'Authors submit to an editor, whose approval passes the page to an admin. Editors submit straight to an admin.' },
];

/** The workflow with these tiers; "No approval" for tiers that aren't one. */
export function workflowOf(tiers: ApprovalTiers | undefined): (typeof APPROVAL_WORKFLOWS)[number] {
  const key = (tiers ?? []).join(',');
  return APPROVAL_WORKFLOWS.find((workflow) => workflow.tiers.join(',') === key) ?? APPROVAL_WORKFLOWS[0]!;
}

/** Stored or submitted settings, with anything that isn't valid left out. */
export function parseApprovalSettings(value: unknown): ApprovalSettings {
  const stored = (value && typeof value === 'object' ? value : {}) as { tiers?: unknown; someoneElse?: unknown };
  const tiers: ApprovalSettings['tiers'] = {};
  for (const [name, list] of Object.entries((stored.tiers && typeof stored.tiers === 'object' ? stored.tiers : {}) as Record<string, unknown>)) {
    const workflow = Array.isArray(list) ? workflowOf(list as ApproverRole[]) : undefined;
    if (workflow && workflow.tiers.length > 0) tiers[name] = [...workflow.tiers];
  }
  return { tiers, someoneElse: stored.someoneElse === true };
}

interface ApprovableType {
  name: string;
  editRoles?: readonly CeraRole[];
  publishable?: boolean;
}

/** A content type's tiers under these settings. Types that are never published have none. */
export function tiersFor(settings: ApprovalSettings, contentType: ApprovableType): ApprovalTiers {
  return contentType.publishable === false ? [] : (settings.tiers[contentType.name] ?? []);
}

/** What someone may do with a content type's pages, besides reading them. */
export interface PageRights {
  /** Save drafts and restore versions. */
  edit: boolean;
  /** Publish and schedule without asking. */
  publish: boolean;
  /** Submit for approval. */
  submit: boolean;
  /** Take pages off the live site and cancel schedules. */
  unpublish: boolean;
  /** Delete pages that aren't live. */
  remove: boolean;
}

export function pageRights(role: CeraRole | null | undefined, contentType: ApprovableType, settings: ApprovalSettings): PageRights {
  const edit = canEditContentType(role, contentType);
  const editor = edit && roleAtLeast(role, 'editor');
  if (contentType.publishable === false) return { edit, publish: false, submit: false, unpublish: false, remove: editor };
  const tiers = tiersFor(settings, contentType);
  const last = tiers[tiers.length - 1];
  const approver = editor && (!last || roleAtLeast(role, last));
  const publish = approver && !(last && settings.someoneElse);
  return { edit, publish, submit: edit && Boolean(last) && !publish, unpublish: approver, remove: editor };
}

/** Something that happened to a request. 'approved' passed it to the next tier; 'published' and 'scheduled' were the last approval. */
export interface ApprovalEvent {
  action: 'submitted' | 'approved' | 'published' | 'scheduled' | 'sent_back' | 'withdrawn' | 'replaced';
  at: string;
  /** Email, when the caller may see it. */
  by?: string;
  role?: CeraRole;
  comment?: string;
}

/** A page's request: waiting for approval, or sent back and not yet answered. */
export interface PageApproval {
  id: string;
  status: 'pending' | 'sent_back';
  /** The version submitted: what approving makes live. */
  version: number;
  /** The role it waits for. */
  awaiting?: ApproverRole;
  /** When the submitter would like it to go live (ISO time). */
  requestedFor?: string;
  submittedAt: string;
  submittedBy?: { id: string; email?: string };
  /** Oldest first. */
  events: ApprovalEvent[];
}

/** What someone may do with a request. */
export interface ApprovalRights {
  /** Approve it or send it back. */
  decide: boolean;
  /** Their approval is the last one needed: it publishes or schedules. */
  final: boolean;
  /** Take it back (their own). */
  withdraw: boolean;
}

/** The rights of a person (by role and id) over a request for a page of this type. */
export function approvalRights(
  person: { role: CeraRole | null | undefined; id: string },
  contentType: ApprovableType,
  settings: ApprovalSettings,
  approval: Pick<PageApproval, 'status' | 'awaiting'> & { submittedBy?: { id: string } },
): ApprovalRights {
  if (approval.status !== 'pending') return { decide: false, final: false, withdraw: false };
  const mine = approval.submittedBy?.id === person.id;
  const decide =
    canEditContentType(person.role, contentType) &&
    roleAtLeast(person.role, approval.awaiting ?? 'editor') &&
    !(mine && settings.someoneElse);
  const tiers = tiersFor(settings, contentType);
  const last = tiers[tiers.length - 1];
  return { decide, final: decide && (!last || roleAtLeast(person.role, last)), withdraw: mine && roleAtLeast(person.role, 'author') };
}

/** A pending request, as the Approvals screen lists it. */
export interface PendingApproval {
  id: string;
  pageId: string;
  contentType: string;
  title: string;
  version: number;
  awaiting: ApproverRole;
  requestedFor?: string;
  submittedAt: string;
  submittedBy?: { id: string; email?: string };
}

/** "an editor" / "an admin". */
export function approverWithArticle(role: ApproverRole | undefined): string {
  return role === 'admin' ? 'an admin' : 'an editor';
}

/* ------------------------------------------------------------------ */
/* Telling people                                                      */
/* ------------------------------------------------------------------ */

/** What happened, and who should hear about it (createAdminActions' `approvalChanged`). */
export interface ApprovalNotice {
  action: 'submitted' | 'approved' | 'published' | 'scheduled' | 'sent_back';
  page: { id: string; title: string; contentType: string; contentTypeLabel: string };
  version: number;
  /** Email of whoever did it. */
  by?: string;
  comment?: string;
  /** 'submitted' and 'approved': the role it now waits for. */
  awaiting?: ApproverRole;
  /** 'submitted': when they'd like it live. 'scheduled': when it goes live. */
  at?: string;
  /** The approvers it waits for, or the person who submitted it. Never whoever did it. */
  to: string[];
}

export interface ApprovalEmail {
  to: string[];
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/** The email for a notice, or null when there's nobody to send it to. `pageUrl` is the page's address in the admin. */
export function approvalEmail(notice: ApprovalNotice, pageUrl: string): ApprovalEmail | null {
  if (notice.to.length === 0) return null;
  // Line breaks in a title would end the subject's header line.
  const title = (notice.page.title || `Untitled ${notice.page.contentTypeLabel.toLowerCase()}`).replace(/\s+/g, ' ').trim();
  const who = notice.by ?? 'Someone';
  const when = notice.at ? `${new Date(notice.at).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '';
  const { subject, line } = {
    submitted: { subject: `For your approval: ${title}`, line: `${who} submitted “${title}” for approval.${when ? ` They’d like it to go live ${when}.` : ''}` },
    approved: { subject: `For your approval: ${title}`, line: `${who} approved “${title}”. It now needs the last approval.` },
    published: { subject: `Published: ${title}`, line: `${who} approved “${title}”. It’s live.` },
    scheduled: { subject: `Scheduled: ${title}`, line: `${who} approved “${title}”. It goes live ${when}.` },
    sent_back: { subject: `Sent back: ${title}`, line: `${who} sent back “${title}”.` },
  }[notice.action];
  const comment = notice.comment?.trim();
  return {
    to: notice.to,
    subject,
    text: [line, ...(comment ? [`“${comment}”`] : []), pageUrl].join('\n\n'),
    html: [
      `<p>${escapeHtml(line)}</p>`,
      ...(comment ? [`<blockquote>${escapeHtml(comment).replace(/\n/g, '<br>')}</blockquote>`] : []),
      `<p><a href="${escapeHtml(pageUrl)}">Open it in the admin</a></p>`,
    ].join('\n'),
  };
}
