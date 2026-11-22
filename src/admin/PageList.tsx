'use client';
/**
 * The Pages screen's table: search, a status filter, sorting and paging over
 * the summaries from `listPages` (./supabase). Everything here is in the
 * browser; the list itself is read on the server as the signed-in user.
 */
import { useMemo, useState, type ReactNode } from 'react';
import type { PageSummary } from '../supabase/index.ts';
import { Icon } from './icons.tsx';

export interface PageListProps {
  pages: PageSummary[];
  /** The editor for a page. */
  editHref: (page: PageSummary) => string;
  /** How many rows a page of the table shows. */
  pageSize?: number;
  /** What the list holds, lowercase. Default "page" / "pages". */
  noun?: string;
  nounPlural?: string;
  /** Heading for the panel count. Default "Panels" (forms: "Fields"); null for types without panels. */
  countLabel?: string | null;
  /** Show slugs as paths ("/about", the default) or as plain IDs ("contact"). */
  slugs?: 'path' | 'id';
  /** With `slugs: 'path'`: a page's address. Default "/" for `home`, "/<slug>" otherwise. */
  pathOf?: (page: PageSummary) => string;
  /** One more column after the count, e.g. a form's submissions. */
  extra?: { label: string; render: (page: PageSummary) => ReactNode };
}

type Filter = 'all' | 'published' | 'drafts' | 'scheduled';
type Sort = 'updated' | 'title';

const FILTERS: Array<{ value: Filter; label: string; test: (page: PageSummary) => boolean }> = [
  { value: 'all', label: 'All', test: () => true },
  { value: 'published', label: 'Published', test: (page) => page.published },
  { value: 'drafts', label: 'Drafts', test: (page) => !page.published },
  { value: 'scheduled', label: 'Scheduled', test: (page) => Boolean(page.schedule) },
];

const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const dayYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const dateTime = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** "Just now", "5 min ago", "3 hr ago", "Yesterday", "Nov 12", "Nov 12, 2025". */
export function formatWhen(isoTime: string, now = Date.now()): string {
  const timestamp = new Date(isoTime).getTime();
  const minutes = Math.round((now - timestamp) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  if (hours < 48) return 'Yesterday';
  const date = new Date(timestamp);
  return date.getFullYear() === new Date(now).getFullYear() ? day.format(date) : dayYear.format(date);
}

export function formatScheduled(isoTime: string): string {
  return dateTime.format(new Date(isoTime));
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

export function PageList({
  pages,
  editHref,
  pageSize = 20,
  noun = 'page',
  nounPlural = `${noun}s`,
  countLabel = 'Panels',
  slugs = 'path',
  pathOf,
  extra,
}: PageListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('updated');
  const [page, setPage] = useState(0);

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((option) => [option.value, pages.filter(option.test).length])) as Record<Filter, number>, [pages]);

  const shown = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const test = FILTERS.find((option) => option.value === filter)!.test;
    return pages
      .filter(test)
      .filter((summary) => words.every((word) => `${summary.title} ${summary.slug}`.toLowerCase().includes(word)))
      .sort((first, second) => (sort === 'title' ? (first.title || first.slug).localeCompare(second.title || second.slug) : second.updatedAt.localeCompare(first.updatedAt)));
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
            Search {nounPlural}
          </label>
          <Icon name="search" />
          <input id="cera-page-search" type="search" placeholder={slugs === 'path' ? 'Search by title or address' : 'Search by name or ID'} value={search} onChange={(event) => (setSearch(event.target.value), reset())} />
        </div>
        <div className="cera-segmented" role="group" aria-label="Status">
          {FILTERS.map((option) => (
            <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => (setFilter(option.value), reset())}>
              {option.label} · {counts[option.value]}
            </button>
          ))}
        </div>
        {/* The same filter as a select, shown instead of the buttons on narrow screens (admin.css). */}
        <label className="cera-sort cera-list-toolbar__status">
          <span className="cera-visually-hidden">Status</span>
          <select value={filter} onChange={(event) => (setFilter(event.target.value as Filter), reset())}>
            {FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} · {counts[option.value]}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={16} strokeWidth={2} />
        </label>
        <label className="cera-sort">
          <span className="cera-visually-hidden">Sort by</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
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
              {countLabel !== null && <th scope="col">{countLabel}</th>}
              {extra && <th scope="col">{extra.label}</th>}
              <th scope="col">Last edited by</th>
              <th scope="col" className="is-end">
                Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4 + (countLabel !== null ? 1 : 0) + (extra ? 1 : 0)} className="cera-table__empty">
                  {pages.length === 0 ? `No ${nounPlural} yet.` : `No ${nounPlural} match.`}
                </td>
              </tr>
            ) : (
              rows.map((summary) => (
                <tr key={summary.id}>
                  <td>
                    <a className="cera-table__title" href={editHref(summary)}>
                      {summary.title || 'Untitled'}
                    </a>
                    <span className="cera-table__slug">{slugs === 'id' ? summary.slug : pathOf ? pathOf(summary) : summary.slug === 'home' ? '/' : `/${summary.slug}`}</span>
                  </td>
                  <td>
                    <PageStatus page={summary} />
                  </td>
                  {countLabel !== null && <td className="cera-table__muted">{summary.panelCount}</td>}
                  {extra && <td className="cera-table__muted">{extra.render(summary)}</td>}
                  <td className="cera-table__muted">{summary.updatedBy ?? '—'}</td>
                  <td className="cera-table__muted is-end">
                    <time dateTime={summary.updatedAt} title={dateTime.format(new Date(summary.updatedAt))} suppressHydrationWarning>
                      {formatWhen(summary.updatedAt)}
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
          Showing {rows.length} of {shown.length} {shown.length === 1 ? noun : nounPlural}
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
