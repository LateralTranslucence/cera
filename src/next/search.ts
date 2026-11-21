/**
 * The Search panel's endpoint: `createSearchHandler` returns a GET route
 * handler (mount it at /api/cera/search). The browser sends the page and
 * panel ids and the visitor's query; the handler reads that panel's settings
 * from the live page (or, in draft-mode preview, the working copy) and
 * searches within them, so a request can narrow a search but never widen it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnyContentType } from '../content-type.ts';
import { readPage, type StoredPage } from '../document.ts';
import type { InferFields, MediaRef } from '../fields.ts';
import type { searchFields } from '../panels/search.fields.ts';
import { searchSettingsOf } from '../panels/search.load.ts';
import { parseSearchQuery, type SearchResults } from '../search/model.ts';
import { createSearchResolver, searchedTypes } from '../supabase/search.ts';

export interface SearchHandlerOptions {
  /** Reads live pages; the anonymous client is enough. Called per request. */
  client: () => SupabaseClient;
  contentTypes: readonly AnyContentType[];
  /** In draft-mode preview: a client that reads working copies (the secret key, behind draft mode). */
  draftClient?: () => SupabaseClient;
  /** Whether this request is a draft-mode preview, e.g. Next's draftMode(). */
  isDraft?: (request: Request) => boolean | Promise<boolean>;
  mediaUrl?: (ref: MediaRef) => string;
  /** Caches a live search (e.g. with cacheLive); the key is the page, panel and query. */
  cache?: (key: string, run: () => Promise<SearchResults>) => Promise<SearchResults>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createSearchHandler(options: SearchHandlerOptions) {
  async function GET(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pageId = url.searchParams.get('pageId') ?? '';
    const panelId = url.searchParams.get('panelId') ?? '';
    if (!UUID.test(pageId) || !panelId || panelId.length > 100) return Response.json({ error: 'Unknown search.' }, { status: 400 });

    const draft = Boolean(options.draftClient && (await options.isDraft?.(request)));
    const client = draft ? options.draftClient!() : options.client();
    const { data, error } = draft
      ? await client.from('cera_pages').select('id, content_type, slug, title, boxes, panels').eq('id', pageId).maybeSingle()
      : await client.from('cera_page_revisions').select('page_id, content_type, slug, title, boxes, panels').eq('page_id', pageId).eq('is_published', true).maybeSingle();
    if (error) return Response.json({ error: 'The search couldn’t be completed.' }, { status: 500 });

    const row = data as (Omit<StoredPage, 'id' | 'contentType'> & { id?: string; page_id?: string; content_type: string }) | null;
    const contentType = row && options.contentTypes.find((candidate) => candidate.name === row.content_type);
    const page = row && contentType ? readPage(contentType, { ...row, id: pageId, contentType: row.content_type }, { status: draft ? 'draft' : 'published' }).page : null;
    const panel = page?.panels.find((candidate: { id: string; type: string; hidden?: boolean }) => candidate.id === panelId && candidate.type === 'cera/search' && !candidate.hidden);
    if (!panel) return Response.json({ error: 'No search panel found.' }, { status: 404 });

    // readPage checked it against the content type's Search panel definition, defaults filled in.
    const settings = searchSettingsOf(panel.data as InferFields<typeof searchFields>);
    const query = parseSearchQuery(url.searchParams, settings, searchedTypes(settings, options.contentTypes));
    const resolver = createSearchResolver(client, options.contentTypes, { draft, ...(options.mediaUrl && { mediaUrl: options.mediaUrl }) });
    const run = () => resolver.run(settings, query);
    try {
      const results = !draft && options.cache ? await options.cache(`${pageId}:${panelId}:${url.searchParams.toString()}`, run) : await run();
      return Response.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return Response.json({ error: 'The search couldn’t be completed.' }, { status: 500 });
    }
  }
  return { GET };
}
