'use client';
/** The Approvals screen's table: every request that's waiting, those the signed-in person can decide first. */
import { approverWithArticle } from '../approvals.ts';
import { formatScheduled, formatWhen } from './PageList.tsx';

export interface ApprovalListItem {
  id: string;
  title: string;
  /** The content type, e.g. "Page". */
  type: string;
  href: string;
  awaiting: 'editor' | 'admin';
  requestedFor?: string;
  submittedAt: string;
  submittedBy?: string;
  /** The signed-in person can approve it. */
  decide: boolean;
  /** Their own request. */
  mine: boolean;
}

export function ApprovalList({ items }: { items: readonly ApprovalListItem[] }) {
  return (
    <div className="cera-card cera-table-wrap">
      <table className="cera-table">
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Waiting for</th>
            <th scope="col">Submitted by</th>
            <th scope="col">Go live</th>
            <th scope="col" className="is-end">
              Submitted
            </th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} className="cera-table__empty">
                Nothing is waiting for approval.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id}>
                <td>
                  <a className="cera-table__title" href={item.href}>
                    {item.title || 'Untitled'}
                  </a>
                  <span className="cera-table__muted">{item.type}</span>
                </td>
                <td>{item.decide ? <span className="cera-pill cera-pill--scheduled">You can approve</span> : <span className="cera-pill cera-pill--draft">{approverWithArticle(item.awaiting)}</span>}</td>
                <td className="cera-table__muted">{item.mine ? 'You' : (item.submittedBy ?? '—')}</td>
                <td className="cera-table__muted" suppressHydrationWarning>
                  {item.requestedFor ? formatScheduled(item.requestedFor) : 'When approved'}
                </td>
                <td className="cera-table__muted is-end">
                  <time dateTime={item.submittedAt} suppressHydrationWarning>
                    {formatWhen(item.submittedAt)}
                  </time>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
