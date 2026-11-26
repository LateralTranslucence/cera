'use client';
/**
 * A page's approval request, at the top of the editor: where it stands, what
 * people wrote, and what the signed-in person can do about it. The dialogs
 * for submitting and deciding are here too.
 */
import { useState, type FormEvent } from 'react';
import { approverWithArticle, type ApprovalEvent, type ApprovalRights, type PageApproval } from '../approvals.ts';
import { Dialog } from './Dialog.tsx';
import { formatScheduled, formatWhen } from './PageList.tsx';
import { toLocalInput } from './state.ts';

/** "Approved", "Sent back"…, for the card and the History dialog. */
export function approvalAction(event: ApprovalEvent): string {
  return {
    submitted: 'Submitted',
    approved: 'First approval',
    published: 'Approved and published',
    scheduled: 'Approved and scheduled',
    sent_back: 'Sent back',
    withdrawn: 'Withdrawn',
    replaced: 'Replaced by a newer version',
  }[event.action];
}

export function ApprovalEvents({ events }: { events: readonly ApprovalEvent[] }) {
  return (
    <ul className="cera-approval__events">
      {events.map((event, index) => (
        <li key={index}>
          <span suppressHydrationWarning>
            {approvalAction(event)}
            {event.by && ` by ${event.by}`} · {formatWhen(event.at)}
          </span>
          {event.comment && <q>{event.comment}</q>}
        </li>
      ))}
    </ul>
  );
}

export interface ApprovalCardProps {
  approval: PageApproval;
  rights: ApprovalRights;
  noun: string;
  /** The editor holds changes the request doesn't have. */
  newer: boolean;
  /** Publishing from the top bar is offered too, and would replace the request. */
  canPublish: boolean;
  previewHref?: string;
  busy: boolean;
  onApprove?: () => void;
  onSendBack?: () => void;
  onWithdraw?: () => void;
}

export function ApprovalCard({ approval, rights, noun, newer, canPublish, previewHref, busy, onApprove, onSendBack, onWithdraw }: ApprovalCardProps) {
  const pending = approval.status === 'pending';
  return (
    <section className="cera-card cera-approval" aria-label="Approval">
      <div className="cera-approval__head">
        <h2>{pending ? `Version ${approval.version} is waiting for ${approverWithArticle(approval.awaiting)}’s approval` : `Version ${approval.version} was sent back`}</h2>
        {pending && approval.requestedFor && (
          <p className="cera-note" suppressHydrationWarning>
            Asked to go live {formatScheduled(approval.requestedFor)}.
          </p>
        )}
        {!pending && <p className="cera-note">Make the changes, then submit it again.</p>}
      </div>
      <ApprovalEvents events={approval.events} />
      {pending && newer && <p className="cera-note">The editor has later changes. They aren’t part of this request: approving it publishes version {approval.version} as it was submitted.</p>}
      {pending && canPublish && <p className="cera-note">Publishing or scheduling this {noun} from the top bar replaces the request instead of approving it.</p>}
      <div className="cera-approval__buttons">
        {previewHref && (
          <a className="cera-button" href={previewHref} target="_blank" rel="noopener">
            Preview version {approval.version}
          </a>
        )}
        {rights.withdraw && onWithdraw && (
          <button type="button" className="cera-button" disabled={busy} onClick={onWithdraw}>
            Withdraw
          </button>
        )}
        {rights.decide && onSendBack && (
          <button type="button" className="cera-button" disabled={busy} onClick={onSendBack}>
            Send back
          </button>
        )}
        {rights.decide && onApprove && (
          <button type="button" className="cera-button cera-button--primary" disabled={busy} onClick={onApprove}>
            {rights.final ? 'Approve and publish' : 'Approve'}
          </button>
        )}
      </div>
    </section>
  );
}

const inFuture = (local: string) => {
  const at = new Date(local);
  return !Number.isNaN(at.getTime()) && at.getTime() > Date.now();
};

/** "Go live at a set time", and the time. */
function TimeChoice({ label, on, at, onToggle, onTime }: { label: string; on: boolean; at: string; onToggle: (on: boolean) => void; onTime: (at: string) => void }) {
  return (
    <>
      <label className="cera-check">
        <input type="checkbox" checked={on} onChange={(event) => onToggle(event.target.checked)} />
        {label}
      </label>
      {on && (
        <label className="cera-inline">
          Date and time (your time zone)
          <input type="datetime-local" required value={at} min={toLocalInput(new Date())} onChange={(event) => onTime(event.target.value)} />
          {!inFuture(at) && <span className="cera-flag cera-flag--danger">Pick a time in the future.</span>}
        </label>
      )}
    </>
  );
}

/** Asks for a note and, if they like, a time, then submits. */
export function SubmitDialog({ open, onClose, noun, replaces, defaultTime, onSubmit }: { open: boolean; onClose: () => void; noun: string; replaces: boolean; defaultTime: () => string; onSubmit: (input: { note: string; publishAt?: string }) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Submit for approval">
      <SubmitForm noun={noun} replaces={replaces} defaultTime={defaultTime} onClose={onClose} onSubmit={onSubmit} />
    </Dialog>
  );
}

function SubmitForm({ noun, replaces, defaultTime, onClose, onSubmit }: { noun: string; replaces: boolean; defaultTime: () => string; onClose: () => void; onSubmit: (input: { note: string; publishAt?: string }) => void }) {
  const [note, setNote] = useState('');
  const [timed, setTimed] = useState(false);
  const [at, setAt] = useState(defaultTime);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (timed && !inFuture(at)) return;
    onSubmit({ note, ...(timed && { publishAt: new Date(at).toISOString() }) });
  };
  return (
    <form className="cera-dialog__form" onSubmit={submit}>
      <p className="cera-note">
        This saves the {noun} and asks for this version to be approved. Changes you save afterward stay drafts until you submit again.
        {replaces && ' It replaces the request that’s waiting now.'}
      </p>
      <label className="cera-inline">
        Note (optional)
        <textarea rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <TimeChoice label="Ask for it to go live at a set time" on={timed} at={at} onToggle={setTimed} onTime={setAt} />
      <div className="cera-dialog__buttons">
        <button type="button" className="cera-button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="cera-button cera-button--primary">
          Submit for approval
        </button>
      </div>
    </form>
  );
}

export interface DecideDialogProps {
  open: boolean;
  onClose: () => void;
  decision: 'approve' | 'send_back';
  approval: PageApproval;
  rights: ApprovalRights;
  noun: string;
  defaultTime: () => string;
  onDecide: (input: { comment: string; publishAt?: string }) => void;
}

export function DecideDialog(props: DecideDialogProps) {
  const title = props.decision === 'send_back' ? 'Send it back' : props.rights.final ? `Approve and publish version ${props.approval.version}` : `Approve version ${props.approval.version}`;
  return (
    <Dialog open={props.open} onClose={props.onClose} title={title}>
      <DecideForm {...props} />
    </Dialog>
  );
}

function DecideForm({ decision, approval, rights, noun, defaultTime, onClose, onDecide }: DecideDialogProps) {
  const asked = approval.requestedFor && inFuture(approval.requestedFor) ? toLocalInput(new Date(approval.requestedFor)) : undefined;
  const [comment, setComment] = useState('');
  const [timed, setTimed] = useState(Boolean(asked));
  const [at, setAt] = useState(asked ?? defaultTime);
  const back = decision === 'send_back';
  const schedule = !back && rights.final && timed;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (schedule && !inFuture(at)) return;
    onDecide({ comment, ...(schedule && { publishAt: new Date(at).toISOString() }) });
  };
  return (
    <form className="cera-dialog__form" onSubmit={submit}>
      <p className="cera-note">
        {back
          ? `Whoever submitted it sees your comment, changes the ${noun} and submits it again.`
          : rights.final
            ? `Version ${approval.version} goes live as it was submitted.`
            : 'This passes it on to an admin, who gives the last approval.'}
      </p>
      <label className="cera-inline">
        {back ? 'What should change?' : 'Comment (optional)'}
        <textarea rows={3} maxLength={2000} required={back} value={comment} onChange={(event) => setComment(event.target.value)} />
      </label>
      {!back && rights.final && <TimeChoice label="Schedule it instead of publishing now" on={timed} at={at} onToggle={setTimed} onTime={setAt} />}
      <div className="cera-dialog__buttons">
        <button type="button" className="cera-button" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="cera-button cera-button--primary">
          {back ? 'Send back' : schedule ? 'Approve and schedule' : rights.final ? 'Approve and publish' : 'Approve'}
        </button>
      </div>
    </form>
  );
}
