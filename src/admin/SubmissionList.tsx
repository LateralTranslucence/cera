'use client';
/**
 * What visitors sent through forms, newest first: each submission as a card
 * with every answer, for one form or all. Download as CSV, delete one, or
 * delete all of a form's (both confirm first; deleting can't be undone).
 */
import { useState, useTransition } from 'react';
import type { Submission } from '../supabase/forms.ts';
import { Dialog } from './Dialog.tsx';
import { Icon } from './icons.tsx';
import { formatWhen } from './PageList.tsx';

export interface SubmissionListProps {
  submissions: Submission[];
  /** Every form, for names and the filter. */
  forms: Array<{ id: string; title: string; slug: string }>;
  /** The form shown, or all. */
  formId?: string;
  /** Switch forms (e.g. navigate to ?form=…). */
  onFilter: (formId: string | undefined) => void;
  /** Deletes the given submissions, or all of a form's; returns how many. Without it, nothing can be deleted. */
  onDelete?: (input: { ids?: string[]; formId?: string }) => Promise<number>;
  /** Link to a CSV of the submissions shown (all of them, not just this page). */
  csvHref?: string;
  /** Link to the next, older batch, when there is one. */
  olderHref?: string;
  /** Link to the newest, when this isn't the first batch. */
  newestHref?: string;
}

const full = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

export function SubmissionList({ submissions: initial, forms, formId, onFilter, onDelete, csvHref, olderHref, newestHref }: SubmissionListProps) {
  const [submissions, setSubmissions] = useState(initial);
  const [confirm, setConfirm] = useState<{ ids?: string[]; formId?: string } | null>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, startBusy] = useTransition();
  const byId = new Map(forms.map((f) => [f.id, f]));
  const form = formId ? byId.get(formId) : undefined;

  const remove = () => {
    if (!onDelete || !confirm) return;
    const target = confirm;
    setConfirm(null);
    startBusy(async () => {
      try {
        const count = await onDelete(target);
        setSubmissions((list) => (target.ids ? list.filter((s) => !target.ids!.includes(s.id)) : list.filter((s) => s.formId !== target.formId)));
        setStatus({ tone: 'success', text: count === 1 ? 'Deleted 1 submission.' : `Deleted ${count} submissions.` });
      } catch (e) {
        setStatus({ tone: 'error', text: `Delete failed: ${e instanceof Error ? e.message : String(e)}` });
      }
    });
  };

  return (
    <>
      <div className="cera-list-toolbar">
        <label className="cera-sort">
          <span className="cera-visually-hidden">Form</span>
          <select value={formId ?? ''} onChange={(e) => onFilter(e.target.value || undefined)}>
            <option value="">All forms</option>
            {forms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title || f.slug}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={16} strokeWidth={2} />
        </label>
        <span className="cera-list-toolbar__spacer" />
        {csvHref && submissions.length > 0 && (
          <a className="cera-button" href={csvHref} download>
            Download CSV
          </a>
        )}
        {onDelete && form && submissions.length > 0 && (
          <button type="button" className="cera-button cera-button--danger" disabled={busy} onClick={() => setConfirm({ formId: form.id })}>
            <Icon name="trash" />
            Delete all
          </button>
        )}
      </div>

      {status && (
        <p className={`cera-status cera-status--${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'}>
          {status.text}
        </p>
      )}

      {submissions.length === 0 ? (
        <p className="cera-card cera-table__empty">{newestHref ? 'No older submissions.' : form ? `No submissions to “${form.title || form.slug}” yet.` : 'No submissions yet.'}</p>
      ) : (
        <ol className="cera-submissions">
          {submissions.map((s) => {
            const f = byId.get(s.formId);
            return (
              <li key={s.id} className="cera-card cera-submission">
                <div className="cera-submission__head">
                  <div>
                    <h2 className="cera-submission__title">{s.email ?? 'No email address'}</h2>
                    <p className="cera-submission__meta" suppressHydrationWarning>
                      <time dateTime={s.createdAt} title={full.format(new Date(s.createdAt))}>
                        {formatWhen(s.createdAt)}
                      </time>
                      {' · '}
                      {f ? f.title || f.slug : 'Deleted form'}
                      {s.pagePath && (
                        <>
                          {' · from '}
                          <span className="cera-mono">{s.pagePath}</span>
                        </>
                      )}
                    </p>
                  </div>
                  {onDelete && (
                    <button type="button" className="cera-icon-button cera-danger" aria-label="Delete submission" title="Delete submission" disabled={busy} onClick={() => setConfirm({ ids: [s.id] })}>
                      <Icon name="trash" />
                    </button>
                  )}
                </div>
                <dl className="cera-submission__answers">
                  {s.values.map((v) => (
                    <div key={v.name}>
                      <dt>{v.label}</dt>
                      <dd>{Array.isArray(v.value) ? v.value.join(', ') || '—' : v.value || '—'}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ol>
      )}

      {(olderHref || newestHref) && (
        <div className="cera-list-footer">
          <span />
          <span className="cera-list-footer__buttons">
            {newestHref && (
              <a className="cera-button" href={newestHref}>
                Newest
              </a>
            )}
            {olderHref && (
              <a className="cera-button" href={olderHref}>
                Older
              </a>
            )}
          </span>
        </div>
      )}

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} title={confirm?.ids ? 'Delete this submission?' : 'Delete all submissions?'}>
        <p>
          {confirm?.ids
            ? 'It’s deleted for good. This can’t be undone.'
            : `Every submission to “${form?.title || form?.slug}” is deleted for good, not just the ones shown. This can’t be undone. Download the CSV first to keep a copy.`}
        </p>
        <div className="cera-dialog__buttons">
          <button type="button" className="cera-button" onClick={() => setConfirm(null)}>
            Keep {confirm?.ids ? 'it' : 'them'}
          </button>
          <button type="button" className="cera-button cera-button--danger" onClick={remove}>
            Delete
          </button>
        </div>
      </Dialog>
    </>
  );
}
