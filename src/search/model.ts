/**
 * The Search panel's model, shared by the server (which searches) and the
 * browser (which draws the filters and results). Ported from the theme's
 * DO_Search / DO_Search_UI / DO_Search_Query.
 *
 * A panel's settings say what visitors may search: which content types,
 * which filters, how many results a page shows and which sort orders. A
 * visitor's query (from the URL or the filter form) is always checked against
 * those settings, so a request can narrow the search but never widen it.
 */

/** The theme's Field Type values. */
export type SearchFilterKind = 'search' | 'alphabet' | 'post_types' | 'select_list';

export interface SearchFilterSetting {
  kind: SearchFilterKind;
  label: string;
  /** Select List: its options are the published pages of this content type. */
  optionsType?: string;
  /** Select List: the field on the searched pages that links to the picked page. Empty: any link to it. */
  field?: string;
}

export type SearchSort = 'newest' | 'oldest' | 'title' | 'title-desc';

export const SORT_LABELS: Record<SearchSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  title: 'Title, A to Z',
  'title-desc': 'Title, Z to A',
};

export interface SearchSettings {
  /** Content types to search. Empty: every type with pages of its own. */
  types: string[];
  filters: SearchFilterSetting[];
  perPage: number;
  /** The sort orders offered, in order; the first is the default. */
  sorts: Array<{ value: SearchSort; label: string }>;
  hideSort: boolean;
}

/** What a visitor asked for. Every part is optional. */
export interface SearchQuery {
  /** Text search ("s" in the URL, as in the theme). */
  text?: string;
  /** A–Z: the first letter of the title, or "#" for anything that isn't a letter. */
  letter?: string;
  /** Post Types: one of the panel's content types. */
  type?: string;
  /** Select Lists, by filter key ("filter-1"…): the picked page's id. */
  picks?: Record<string, string>;
  sort?: SearchSort;
  /** 1-based. */
  page?: number;
}

export interface SearchCard {
  id: string;
  url: string;
  title: string;
  typeLabel: string;
  description?: string;
  image?: { src: string; width?: number; height?: number };
}

export interface SearchResults {
  cards: SearchCard[];
  total: number;
  /** The page shown (1-based) and how many there are. */
  page: number;
  pages: number;
  sort: SearchSort;
}

export interface SearchOption {
  value: string;
  label: string;
}

/** The filter form, as the browser draws it. */
export interface PublicSearchFilter {
  /** The query parameter: "s", "letter", "type", or "filter-N" for a select list. */
  key: string;
  kind: SearchFilterKind;
  label: string;
  /** Post Types and Select List. */
  options?: SearchOption[];
}

export interface PublicSearch {
  filters: PublicSearchFilter[];
  sorts: Array<{ value: SearchSort; label: string }>;
  hideSort: boolean;
}

export const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '#'];
export const MAX_PER_PAGE = 48;
export const DEFAULT_PER_PAGE = 12;
const MAX_TEXT = 200;

/** The query parameter each filter uses. Select lists are numbered by their place among the panel's filters. */
export function filterKey(filter: SearchFilterSetting, index: number): string {
  switch (filter.kind) {
    case 'search':
      return 's';
    case 'alphabet':
      return 'letter';
    case 'post_types':
      return 'type';
    case 'select_list':
      return `filter-${index + 1}`;
  }
}

/**
 * A visitor's query from URL parameters, keeping only what the panel offers:
 * a filter the panel doesn't have is ignored, and an unknown sort falls back
 * to the panel's first.
 */
export function parseSearchQuery(params: URLSearchParams, settings: SearchSettings, allowedTypes: readonly string[]): SearchQuery {
  const query: SearchQuery = {};
  settings.filters.forEach((filter, index) => {
    const value = params.get(filterKey(filter, index))?.trim();
    if (!value) return;
    if (filter.kind === 'search') query.text = value.slice(0, MAX_TEXT);
    else if (filter.kind === 'alphabet' && LETTERS.includes(value.toUpperCase())) query.letter = value.toUpperCase();
    else if (filter.kind === 'post_types' && allowedTypes.includes(value)) query.type = value;
    else if (filter.kind === 'select_list' && /^[0-9a-f-]{36}$/i.test(value)) (query.picks ??= {})[filterKey(filter, index)] = value;
  });
  // The theme's ?s= works even when the panel has no text field (a site-wide search page links to it).
  if (!query.text && params.get('s')?.trim()) query.text = params.get('s')!.trim().slice(0, MAX_TEXT);
  const sort = params.get('sort') as SearchSort | null;
  query.sort = sort && settings.sorts.some((option) => option.value === sort) ? sort : (settings.sorts[0]?.value ?? 'newest');
  const page = Number(params.get('page'));
  query.page = Number.isInteger(page) && page > 1 ? page : 1;
  return query;
}

/** URL parameters for a query: only what differs from the defaults, so plain searches have short URLs. */
export function searchQueryParams(query: SearchQuery, settings: Pick<SearchSettings, 'sorts'> | PublicSearch): URLSearchParams {
  const params = new URLSearchParams();
  if (query.text) params.set('s', query.text);
  if (query.letter) params.set('letter', query.letter);
  if (query.type) params.set('type', query.type);
  for (const [key, value] of Object.entries(query.picks ?? {})) if (value) params.set(key, value);
  if (query.sort && query.sort !== settings.sorts[0]?.value) params.set('sort', query.sort);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  return params;
}
