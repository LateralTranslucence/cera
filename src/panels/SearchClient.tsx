'use client';
/**
 * The Search panel's filters and results (the theme's Search.tsx). The first
 * page of results arrives with the page; after that, each change to the
 * filters, sort or page asks the search endpoint (createSearchHandler) for
 * results and puts the query in the URL, so a search can be shared or
 * reloaded. The theme's ?s= keyword in the URL starts a text search.
 *
 * Text search runs when the form is sent (Enter or the Search button); the
 * other filters, sorting and paging run as soon as they change.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { LETTERS, searchQueryParams, type PublicSearch, type SearchQuery, type SearchResults, type SearchSort } from '../search/model.ts';

export interface SearchClientProps {
  endpoint: string;
  pageId: string;
  panelId: string;
  form: PublicSearch;
  initial: SearchResults;
  perRow: number;
  /** Names the search form for screen readers, e.g. the panel's title. */
  label: string;
}

/** Every URL parameter a Search panel uses, so a new query can replace the old one. */
const OWN_PARAMS = /^(s|letter|type|sort|page|filter-\d+)$/;

/** The visitor's query from the URL, keeping only what this panel offers. */
function queryFromUrl(form: PublicSearch): SearchQuery | null {
  const params = new URLSearchParams(window.location.search);
  if (![...params.keys()].some((key) => OWN_PARAMS.test(key))) return null;
  const query: SearchQuery = {};
  for (const filter of form.filters) {
    const value = params.get(filter.key)?.trim();
    if (!value) continue;
    if (filter.kind === 'search') query.text = value;
    else if (filter.kind === 'alphabet' && LETTERS.includes(value.toUpperCase())) query.letter = value.toUpperCase();
    else if (filter.kind === 'post_types' && filter.options?.some((option) => option.value === value)) query.type = value;
    else if (filter.kind === 'select_list' && filter.options?.some((option) => option.value === value)) (query.picks ??= {})[filter.key] = value;
  }
  if (!query.text && params.get('s')?.trim()) query.text = params.get('s')!.trim();
  const sort = params.get('sort') as SearchSort | null;
  if (sort && form.sorts.some((option) => option.value === sort)) query.sort = sort;
  const page = Number(params.get('page'));
  if (Number.isInteger(page) && page > 1) query.page = page;
  return query;
}

export function SearchClient({ endpoint, pageId, panelId, form, initial, perRow, label }: SearchClientProps) {
  const baseId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState<SearchQuery>({});
  const [results, setResults] = useState<SearchResults>(initial);
  const [status, setStatus] = useState<'ready' | 'loading' | 'failed'>('ready');
  // Bumped by Try Again to send the same query again, and keys the error alert so a repeat failure is announced.
  const [attempt, setAttempt] = useState(0);
  // Whether a search has been asked for since the page loaded (the first results came with it).
  const [asked, setAsked] = useState(false);
  const textFilter = form.filters.find((filter) => filter.kind === 'search');
  const [text, setText] = useState('');

  // A query in the URL (a shared link, or ?s= from a site search box) runs on load.
  useEffect(() => {
    const fromUrl = queryFromUrl(form);
    if (!fromUrl) return;
    setQuery(fromUrl);
    setText(fromUrl.text ?? '');
    setAsked(true);
  }, [form]);

  useEffect(() => {
    if (!asked) return;
    const controller = new AbortController();
    const params = searchQueryParams(query, form);
    // Keep the query in the URL, next to anything else the page's address holds.
    const address = new URL(window.location.href);
    for (const key of [...address.searchParams.keys()]) if (OWN_PARAMS.test(key)) address.searchParams.delete(key);
    for (const [key, value] of params) address.searchParams.set(key, value);
    window.history.replaceState(window.history.state, '', address);

    setStatus('loading');
    const request = new URLSearchParams(params);
    request.set('pageId', pageId);
    request.set('panelId', panelId);
    fetch(`${endpoint}?${request}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: { results: SearchResults }) => {
        setResults(body.results);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== 'AbortError') setStatus('failed');
      });
    return () => controller.abort();
  }, [asked, query, attempt, endpoint, pageId, panelId, form]);

  /** A new query; anything but paging starts again at the first page. */
  const change = (next: SearchQuery, keepPage = false) => {
    setQuery({ ...next, page: keepPage ? next.page : 1 });
    setAsked(true);
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    change({ ...query, text: text.trim() || undefined });
  };
  const goToPage = (page: number) => {
    change({ ...query, page }, true);
    formRef.current?.scrollIntoView({ block: 'start' });
  };

  // The results statement: each filter in use, as a button that removes it.
  const criteria: Array<{ label: string; remove: SearchQuery }> = [];
  if (query.text) criteria.push({ label: `“${query.text}”`, remove: { ...query, text: undefined } });
  for (const filter of form.filters) {
    if (filter.kind === 'alphabet' && query.letter) criteria.push({ label: `${filter.label}: ${query.letter}`, remove: { ...query, letter: undefined } });
    if (filter.kind === 'post_types' && query.type) {
      criteria.push({ label: `${filter.label}: ${filter.options?.find((option) => option.value === query.type)?.label ?? query.type}`, remove: { ...query, type: undefined } });
    }
    const pick = query.picks?.[filter.key];
    if (filter.kind === 'select_list' && pick) {
      criteria.push({ label: `${filter.label}: ${filter.options?.find((option) => option.value === pick)?.label ?? pick}`, remove: { ...query, picks: { ...query.picks, [filter.key]: '' } } });
    }
  }
  const count = `${results.total} ${results.total === 1 ? 'result' : 'results'}`;
  const showSort = !form.hideSort && form.sorts.length > 1;

  return (
    <div className="cera-search">
      <form ref={formRef} className="cera-search__form" role="search" aria-label={label} onSubmit={onSubmit}>
        {form.filters.map((filter) => {
          const id = `${baseId}-${filter.key}`;
          if (filter.kind === 'search') {
            return (
              <div key={filter.key} className="cera-search__filter cera-search__filter--text">
                <label htmlFor={id}>{filter.label}</label>
                <span className="cera-search__text">
                  <input id={id} type="search" name="s" value={text} onChange={(event) => setText(event.target.value)} />
                  <button type="submit">Search</button>
                </span>
              </div>
            );
          }
          if (filter.kind === 'alphabet') {
            return (
              <fieldset key={filter.key} className="cera-search__filter cera-search__filter--letters">
                <legend>{filter.label}</legend>
                <span className="cera-search__letters">
                  <button type="button" aria-pressed={!query.letter} onClick={() => change({ ...query, letter: undefined })}>
                    All
                  </button>
                  {LETTERS.map((letter) => (
                    <button key={letter} type="button" aria-pressed={query.letter === letter} onClick={() => change({ ...query, letter })} aria-label={letter === '#' ? 'Not a letter' : undefined}>
                      {letter}
                    </button>
                  ))}
                </span>
              </fieldset>
            );
          }
          const value = filter.kind === 'post_types' ? (query.type ?? '') : (query.picks?.[filter.key] ?? '');
          return (
            <div key={filter.key} className="cera-search__filter cera-search__filter--select">
              <label htmlFor={id}>{filter.label}</label>
              <select
                id={id}
                value={value}
                onChange={(event) =>
                  change(filter.kind === 'post_types' ? { ...query, type: event.target.value || undefined } : { ...query, picks: { ...query.picks, [filter.key]: event.target.value } })
                }
              >
                <option value="">All</option>
                {filter.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
        {/* Without a text field, Enter still needs something to send. */}
        {!textFilter && form.filters.length === 0 && <input type="hidden" name="s" value="" />}
      </form>

      <div className="cera-search__summary">
        <p className="cera-search__statement">
          {status === 'failed' ? null : count}
          {criteria.length > 0 && <span> for </span>}
          {criteria.map((criterion) => (
            <button key={criterion.label} type="button" className="cera-search__criterion" onClick={() => change(criterion.remove)} aria-label={`Remove ${criterion.label}`}>
              {criterion.label}
              <span aria-hidden="true"> ✕</span>
            </button>
          ))}
        </p>
        {showSort && (
          <span className="cera-search__sort">
            <label htmlFor={`${baseId}-sort`}>Sort by</label>
            <select id={`${baseId}-sort`} value={query.sort ?? results.sort} onChange={(event) => change({ ...query, sort: event.target.value as SearchSort })}>
              {form.sorts.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </span>
        )}
      </div>

      {/* Announces each new set of results; the statement above holds buttons, so it can't be the live region. */}
      <p className="cera-visually-hidden" role="status">
        {asked && status === 'ready' ? (results.total > 0 ? count : 'Nothing matched your search.') : ''}
      </p>

      <div ref={resultsRef} className="cera-search__results" aria-busy={status === 'loading'}>
        {status === 'failed' ? (
          <>
            <p key={attempt} className="cera-search__error" role="alert">
              Sorry, the search couldn’t be completed.
            </p>
            <button type="button" className="cera-search__retry" onClick={() => setAttempt((count) => count + 1)}>
              Try again
            </button>
          </>
        ) : results.cards.length === 0 ? (
          <p className="cera-search__empty">Nothing matched your search. Try fewer or different words, or remove a filter.</p>
        ) : (
          <>
            <ul className="posts" style={{ ['--per-row' as string]: perRow }}>
              {results.cards.map((card) => (
                <li key={card.id} className="post-card">
                  {card.image && <img className="post-card__image" src={card.image.src} alt="" width={card.image.width} height={card.image.height} loading="lazy" />}
                  <div className="post-card__text">
                    <p className="post-card__type">{card.typeLabel}</p>
                    <h3>
                      <a href={card.url} className="post-card__link">
                        {card.title}
                      </a>
                    </h3>
                    {card.description && <p className="post-card__description">{card.description}</p>}
                  </div>
                </li>
              ))}
            </ul>
            {results.pages > 1 && (
              <nav className="cera-search__paging" aria-label="Search results pages">
                <button type="button" disabled={results.page <= 1} onClick={() => goToPage(results.page - 1)}>
                  Previous
                </button>
                <span>
                  Page {results.page} of {results.pages}
                </span>
                <button type="button" disabled={results.page >= results.pages} onClick={() => goToPage(results.page + 1)}>
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
