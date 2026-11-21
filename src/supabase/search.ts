/**
 * Search for Search panels (the theme's DO_Search_Query), over pages stored
 * in Supabase.
 *
 * - Live (`draft: false`): published, visible pages only. Any client works.
 * - Draft (`draft: true`): working copies, for preview. Needs a staff client,
 *   or the secret key on the server behind draft mode.
 *
 * Every page of the content types searched is read and filtered here, not in
 * SQL: hidden pages (a content type's `hidden`) and full-text matching need
 * the typed page. That suits a site's pages (hundreds, not millions); cache
 * the live results in front of it (see the example site's search route).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { pageUrl, type AnyContentType, type PageOf } from '../content-type.ts';
import { readPage, type StoredPage } from '../document.ts';
import { mediaUrl as defaultMediaUrl } from '../media-url.ts';
import type { MediaRef } from '../fields.ts';
import type { SearchResolver } from '../panel.ts';
import { filterKey, type PublicSearch, type SearchCard, type SearchQuery, type SearchResults, type SearchSettings } from '../search/model.ts';
import { fail } from './errors.ts';

export const DEFAULT_SEARCH_ENDPOINT = '/api/cera/search';

interface Entry {
  id: string;
  contentType: AnyContentType;
  page: PageOf<AnyContentType>;
  /** When it went live (or, in preview, was last saved). */
  date: string;
  /** Lowercase text of the title and every field, for text search. */
  text: string;
  /** The stored boxes and panels, for select-list links. */
  stored: StoredPage;
}

interface Row {
  id?: string;
  page_id?: string;
  content_type: string;
  slug: string;
  title: string;
  boxes: StoredPage['boxes'];
  panels: StoredPage['panels'];
  created_at?: string;
  updated_at?: string;
}

/** Lowercase, without accents, tags or entities: "Café <b>Noir</b>" → "cafe noir". */
export function searchableText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function collectText(value: unknown, into: string[]): void {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) for (const item of value) collectText(item, into);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) collectText(item, into);
}

/** Every value stored under `key`, anywhere in a page's boxes and panels. */
function valuesAt(value: unknown, key: string, into: unknown[] = []): unknown[] {
  if (Array.isArray(value)) for (const item of value) valuesAt(item, key, into);
  else if (value && typeof value === 'object') {
    for (const [name, item] of Object.entries(value)) {
      if (name === key) into.push(item);
      valuesAt(item, key, into);
    }
  }
  return into;
}

function linksTo(entry: Entry, pageId: string, key: string | undefined): boolean {
  const where = { boxes: entry.stored.boxes, panels: entry.stored.panels.map((panel) => panel.data) };
  if (!key) return JSON.stringify(where).includes(pageId);
  return valuesAt(where, key).some((value) => value === pageId || (Array.isArray(value) && value.includes(pageId)));
}

/** "Mars" → "M"; "42 moons" or "Éclipse"… a letter after accents are removed, else "#". */
function initialOf(title: string): string {
  const first = searchableText(title.trim()).charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

/** The content types a panel searches: its own choice among types with pages of their own, or all of those. */
export function searchedTypes(settings: Pick<SearchSettings, 'types'>, contentTypes: readonly AnyContentType[]): string[] {
  const routed = contentTypes.filter((contentType) => contentType.route).map((contentType) => contentType.name as string);
  const chosen = settings.types.filter((name) => routed.includes(name));
  return chosen.length > 0 ? chosen : routed;
}

export function createSearchResolver(
  client: SupabaseClient,
  contentTypes: readonly AnyContentType[],
  options: { draft: boolean; endpoint?: string; mediaUrl?: (ref: MediaRef) => string },
): SearchResolver {
  const toUrl = options.mediaUrl ?? defaultMediaUrl;
  const byName = new Map(contentTypes.map((contentType) => [contentType.name as string, contentType]));
  const typesOf = (settings: SearchSettings) => searchedTypes(settings, contentTypes);

  const cache = new Map<string, Promise<Entry[]>>();
  /** Every visible page of these types, read once per resolver. */
  const entriesOf = (types: readonly string[]) => {
    const key = [...types].sort().join(',');
    if (!cache.has(key)) cache.set(key, readEntries(types));
    return cache.get(key)!;
  };

  async function readEntries(types: readonly string[]): Promise<Entry[]> {
    if (types.length === 0) return [];
    const { data, error } = options.draft
      ? await client.from('cera_pages').select('id, content_type, slug, title, boxes, panels, updated_at').in('content_type', types)
      : await client.from('cera_page_revisions').select('page_id, content_type, slug, title, boxes, panels, created_at').in('content_type', types).eq('is_published', true);
    if (error) fail(error);
    const entries: Entry[] = [];
    for (const row of (data ?? []) as Row[]) {
      const contentType = byName.get(row.content_type);
      if (!contentType) continue;
      const id = (row.page_id ?? row.id)!;
      const stored: StoredPage = { id, contentType: row.content_type, slug: row.slug, title: row.title, boxes: row.boxes, panels: row.panels };
      const { page } = readPage(contentType, stored, { status: options.draft ? 'draft' : 'published' });
      if (!options.draft && contentType.hidden?.(page)) continue;
      const parts = [page.title];
      collectText(page.boxes, parts);
      collectText(page.panels.map((panel: { data: unknown }) => panel.data), parts);
      // As ISO text, whatever the client returns (Supabase gives strings, other Postgres clients Dates), so dates sort as text.
      entries.push({ id, contentType, page, date: new Date((row.created_at ?? row.updated_at)!).toISOString(), text: searchableText(parts.join(' ')), stored });
    }
    return entries;
  }

  const card = (entry: Entry): SearchCard => {
    const image = entry.contentType.seo?.image?.(entry.page);
    const description = entry.contentType.seo?.description?.(entry.page);
    return {
      id: entry.id,
      url: pageUrl(entry.contentType, entry.page),
      title: entry.page.title || 'Untitled',
      typeLabel: entry.contentType.label,
      ...(description && { description }),
      ...(image && image.kind === 'image' && { image: { src: toUrl(image), width: image.width, height: image.height } }),
    };
  };

  return {
    endpoint: options.endpoint ?? DEFAULT_SEARCH_ENDPOINT,

    async describe(settings): Promise<PublicSearch> {
      const types = typesOf(settings);
      const filters = await Promise.all(
        settings.filters.map(async (filter, index) => {
          const base = { key: filterKey(filter, index), kind: filter.kind, label: filter.label };
          if (filter.kind === 'post_types') {
            return { ...base, options: types.map((name) => ({ value: name, label: byName.get(name)?.label ?? name })) };
          }
          if (filter.kind === 'select_list') {
            const optionTypes = filter.optionsType && byName.has(filter.optionsType) ? [filter.optionsType] : [];
            const pages = await entriesOf(optionTypes);
            const options = pages.map((entry) => ({ value: entry.id, label: entry.page.title || 'Untitled' })).sort((first, second) => first.label.localeCompare(second.label));
            return { ...base, options };
          }
          return base;
        }),
      );
      return { filters, sorts: settings.sorts, hideSort: settings.hideSort };
    },

    async run(settings, query: SearchQuery): Promise<SearchResults> {
      const allowed = typesOf(settings);
      const types = query.type && allowed.includes(query.type) ? [query.type] : allowed;
      let found = await entriesOf(types);

      const words = searchableText(query.text ?? '').split(/\s+/).filter(Boolean);
      if (words.length) found = found.filter((entry) => words.every((word) => entry.text.includes(word)));
      if (query.letter) found = found.filter((entry) => initialOf(entry.page.title) === query.letter);
      settings.filters.forEach((filter, index) => {
        const pick = query.picks?.[filterKey(filter, index)];
        if (filter.kind === 'select_list' && pick) found = found.filter((entry) => linksTo(entry, pick, filter.field));
      });

      const sort = query.sort && settings.sorts.some((option) => option.value === query.sort) ? query.sort : (settings.sorts[0]?.value ?? 'newest');
      const byTitle = (first: Entry, second: Entry) => first.page.title.localeCompare(second.page.title, undefined, { sensitivity: 'base' });
      found = [...found].sort((first, second) => {
        switch (sort) {
          case 'oldest':
            return first.date.localeCompare(second.date);
          case 'title':
            return byTitle(first, second);
          case 'title-desc':
            return byTitle(second, first);
          default:
            return second.date.localeCompare(first.date);
        }
      });

      const pages = Math.max(1, Math.ceil(found.length / settings.perPage));
      const page = Math.min(Math.max(query.page ?? 1, 1), pages);
      return { cards: found.slice((page - 1) * settings.perPage, page * settings.perPage).map(card), total: found.length, page, pages, sort };
    },
  };
}
