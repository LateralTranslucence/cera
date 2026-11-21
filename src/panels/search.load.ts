// Server-side: turns the panel's fields into search settings, then draws the
// filter form and the first page of results through loadContext.search, so
// they show before any JavaScript runs. SearchClient takes over from there.
import type { InferFields } from '../fields.ts';
import type { LoadContext } from '../panel.ts';
import { DEFAULT_PER_PAGE, MAX_PER_PAGE, SORT_LABELS, type SearchFilterKind, type SearchSettings, type SearchSort } from '../search/model.ts';
import type { searchFields } from './search.fields.ts';

const DEFAULT_FILTER_LABELS: Record<SearchFilterKind, string> = {
  search: 'Keyword',
  alphabet: 'Starts with',
  post_types: 'Type',
  select_list: 'Filter',
};

/** The settings a Search panel's fields describe. Also used by the search route handler. */
export function searchSettingsOf(data: InferFields<typeof searchFields>): SearchSettings {
  const offered = data.sortBy.length > 0 ? data.sortBy : (Object.keys(SORT_LABELS) as SearchSort[]).map((value) => ({ value, label: '' }));
  const sorts: SearchSettings['sorts'] = [];
  for (const row of offered) {
    if (sorts.some((sort) => sort.value === row.value)) continue;
    sorts.push({ value: row.value, label: row.label?.trim() || SORT_LABELS[row.value] });
  }
  return {
    types: data.postTypes,
    filters: data.filters.map((filter) => ({
      kind: filter.kind,
      label: filter.label?.trim() || DEFAULT_FILTER_LABELS[filter.kind],
      ...(filter.optionsType && { optionsType: filter.optionsType }),
      ...(filter.field?.trim() && { field: filter.field.trim() }),
    })),
    perPage: Math.min(Math.max(Math.round(data.perPage ?? DEFAULT_PER_PAGE), 1), MAX_PER_PAGE),
    sorts,
    hideSort: data.hideSortBy,
  };
}

export async function loadSearch(data: InferFields<typeof searchFields>, context: LoadContext) {
  if (!context.search) throw new Error('The Search panel needs loadContext.search (see createSearchResolver).');
  const settings = searchSettingsOf(data);
  const [form, initial] = await Promise.all([context.search.describe(settings), context.search.run(settings, { sort: settings.sorts[0]?.value, page: 1 })]);
  return {
    endpoint: context.search.endpoint,
    pageId: context.page.id,
    panelId: context.panel.panelId,
    form,
    initial,
    preview: context.draft,
  };
}

export type SearchLoaded = Awaited<ReturnType<typeof loadSearch>>;
