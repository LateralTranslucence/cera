/**
 * A site's own icons (the Icon content type) as an icon set named `custom`:
 * values look like `custom:<icon id>`.
 *
 * - Live (`draft: false`): published icons only. Any client works, since
 *   published revisions are public.
 * - Draft (`draft: true`): working copies, for preview and the admin's
 *   picker, with "Not published" on icons that aren't live. Needs a staff
 *   client (or the secret key on the server behind draft mode).
 *
 * Hidden icons aren't offered by `search`, but `get` still draws them, so
 * pages that use one keep it. SVGs are cleaned again as they're read.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { iconType } from '../icons/icon-type.ts';
import { matchScore, queryWords, type IconGlyph, type IconSet } from '../icons/library.ts';
import { safeSvg } from '../svg.ts';
import { fail } from './errors.ts';

interface IconRow {
  id: string;
  title: string;
  boxes: { icon?: { svg?: unknown; keywords?: unknown; hidden?: unknown } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function supabaseIcons(client: SupabaseClient, opts: { draft: boolean; label?: string }): IconSet {
  const rows = async (ids?: readonly string[]): Promise<Array<IconRow & { live: boolean }>> => {
    const query = opts.draft
      ? client.from('cera_pages').select('id, title, boxes').eq('content_type', iconType.name)
      : client.from('cera_page_revisions').select('page_id, title, boxes').eq('content_type', iconType.name).eq('is_published', true);
    const { data, error } = ids ? await (opts.draft ? query.in('id', ids) : query.in('page_id', ids)) : await query;
    if (error) fail(error);
    const found = ((data ?? []) as Array<Omit<IconRow, 'id'> & { id?: string; page_id?: string }>).map((row) => ({ ...row, id: (row.id ?? row.page_id)! }));
    if (!opts.draft || found.length === 0) return found.map((row) => ({ ...row, live: true }));
    const live = await client.from('cera_page_revisions').select('page_id').in('page_id', found.map((row) => row.id)).eq('is_published', true);
    if (live.error) fail(live.error);
    const liveIds = new Set((live.data as Array<{ page_id: string }>).map((revision) => revision.page_id));
    return found.map((row) => ({ ...row, live: liveIds.has(row.id) }));
  };

  const glyph = (row: IconRow & { live: boolean }): IconGlyph | null => {
    const svg = typeof row.boxes.icon?.svg === 'string' ? safeSvg(row.boxes.icon.svg) : '';
    if (!svg) return null;
    return { value: `custom:${row.id}`, label: row.title || 'Untitled icon', svg, ...(!row.live && { note: 'Not published' }) };
  };

  return {
    name: 'custom',
    label: opts.label ?? 'Your icons',

    async search(query, limit) {
      const words = queryWords(query);
      const scored: Array<[number, string, IconGlyph]> = [];
      for (const row of await rows()) {
        if (row.boxes.icon?.hidden === true) continue;
        const name = row.title.toLowerCase().trim().replace(/\s+/g, '-');
        const keywords = typeof row.boxes.icon?.keywords === 'string' ? queryWords(row.boxes.icon.keywords) : [];
        const score = matchScore(name, keywords, words);
        const iconGlyph = score === null ? null : glyph(row);
        if (iconGlyph) scored.push([score!, iconGlyph.label, iconGlyph]);
      }
      scored.sort((first, second) => first[0] - second[0] || first[1].localeCompare(second[1]));
      return scored.slice(0, limit).map(([, , iconGlyph]) => iconGlyph);
    },

    async get(names) {
      const ids = names.filter((name) => UUID.test(name));
      if (ids.length === 0) return [];
      return (await rows(ids)).map(glyph).filter((iconGlyph): iconGlyph is IconGlyph => iconGlyph !== null);
    },
  };
}
