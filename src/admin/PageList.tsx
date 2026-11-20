'use client';
/**
 * The Pages screen's table: search, a status filter, sorting and paging over
 * the summaries from `listPages` (./supabase). Everything here is in the
 * browser; the list itself is read on the server as the signed-in user.
 */
import { useMemo, useState } from 'react';
import type { PageSummary } from '../supabase/index.ts';
import { Icon } from './icons.tsx';

export interface PageListProps {
  pages: PageSummary[];
  /** The editor for a page. */
  editHref: (page: PageSummary) => string;
  /** How many rows a page of the table shows. */
  pageSize?: number;
}

type Filter = 'all' | 'published' | 'drafts' | 'scheduled';
type Sort = 'updated' | 'title';

const FILTERS: Array<{ value: Filter; label: string; test: (p: PageSummary) => boolean }> = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'published', label: 'Published', test: (p) => p.published },
  { value: 'drafts', label: 'Drafts', test: (p) => !p.published },
  { value: 'scheduled', label: 'Scheduled', test: (p) => Boolean(p.schedule) },
];

const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const dayYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const dateTime = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "Just now", "5 min ago", "3 hr ago", "Yesterday", "Nov 12", "Nov 12, 2025". */
export function formatWhen(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const minutes = Math.round((now - t) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  if (hours < 48) return 'Yesterday';
  const date = new Date(t);
  return date.getFullYear() === new Date(now).getFullYear() ? day.format(date) : dayYear.format(date);
}

export function formatScheduled(iso: string): string {
  return dateTime.format(new Date(iso));
}

/** Published / Draft / Scheduled, by shape as well as color; plus what's pending. */
export function PageStatus({ page }: { page: PageSummary }) {
  return (
    <span className="cera-table__status">
      {page.published ? (
        <span className="cera-pill">Published</span>
      ) : page.schedule ? (
        <span className="cera-pill cera-pill--scheduled" suppressHydrationWarning>
          Scheduled · {day.format(new Date(page.schedule.at))}
        </span>
      ) : (
        <span className="cera-pill cera-pill--draft">Draft</span>
      )}
      {page.published && page.schedule ? (
        <span className="cera-flag" suppressHydrationWarning>
          Update scheduled · {day.format(new Date(page.schedule.at))}
        </span>
      ) : page.unpublishedChanges ? (
        <span className="cera-flag">Unpublished changes</span>
      ) : null}
      {page.scheduleFailed && <span className="cera-flag cera-flag--danger">Scheduled publish failed</span>}
    </span>
  );
}

export function PageList({ pages, editHref, pageSize = 20 }: PageListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('updated');
  const [page, setPage] = useState(0);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.value, pages.filter(f.test).length])) as Record<Filter, number>, [pages]);

  const shown = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const test = FILTERS.find((f) => f.value === filter)!.test;
    return pages
      .filter(test)
      .filter((p) => words.every((w) => `${p.title} ${p.slug}`.toLowerCase().includes(w)))
      .sort((a, b) => (sort === 'title' ? (a.title || a.slug).localeCompare(b.title || b.slug) : b.updatedAt.localeCompare(a.updatedAt)));
  }, [pages, search, filter, sort]);

  const pageCount = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const rows = shown.slice(current * pageSize, (current + 1) * pageSize);
  const reset = () => setPage(0);

  return (
    <>
      <div className="cera-list-toolbar">
        <div className="cera-search">
          <label htmlFor="cera-page-search" className="cera-visually-hidden">
            Search pages
          </label>
          <Icon name="search" />
          <input id="cera-page-search" type="search" placeholder="Search by title or address" value={search} onChange={(e) => (setSearch(e.target.value), reset())} />
        </div>
        <div className="cera-segmented" role="group" aria-label="Status">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => (setFilter(f.value), reset())}>
              {f.label} · {counts[f.value]}
            </button>
          ))}
        </div>
        <label className="cera-sort">
          <span className="cera-visually-hidden">Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="updated">Sort: Last updated</option>
            <option value="title">Sort: Title</option>
          </select>
          <Icon name="chevronDown" size={16} strokeWidth={2} />
        </label>
      </div>

      <div className="cera-card cera-table-wrap">
        <table className="cera-table">
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Status</th>
              <th scope="col">Panels</th>
              <th scope="col">Last edited by</th>
              <th scope="col" className="is-end">
                Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="cera-table__empty">
                  {pages.length === 0 ? 'No pages yet.' : 'No pages match.'}
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <a className="cera-table__title" href={editHref(p)}>
                      {p.title || 'Untitled'}
                    </a>
                    <span className="cera-table__slug">{p.slug === 'home' ? '/' : `/${p.slug}`}</span>
                  </td>
                  <td>
                    <PageStatus page={p} />
                  </td>
                  <td className="cera-table__muted">{p.panelCount}</td>
                  <td className="cera-table__muted">{p.updatedBy ?? '—'}</td>
                  <td className="cera-table__muted is-end">
                    <time dateTime={p.updatedAt} title={dateTime.format(new Date(p.updatedAt))} suppressHydrationWarning>
                      {formatWhen(p.updatedAt)}
                    </time>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="cera-list-footer">
        <span aria-live="polite">
          Showing {rows.length} of {shown.length} {shown.length === 1 ? 'page' : 'pages'}
        </span>
        {(
          <span className="cera-list-footer__buttons">
            <button type="button" className="cera-button" disabled={current === 0} onClick={() => setPage(current - 1)}>
              Previous
            </button>
            <button type="button" className="cera-button" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>
              Next
            </button>
          </span>
        )}
      </div>
    </>
  );
}
