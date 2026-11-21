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
    const q = opts.draft
      ? client.from('cera_pages').select('id, title, boxes').eq('content_type', iconType.name)
      : client.from('cera_page_revisions').select('page_id, title, boxes').eq('content_type', iconType.name).eq('is_published', true);
    const { data, error } = ids ? await (opts.draft ? q.in('id', ids) : q.in('page_id', ids)) : await q;
    if (error) fail(error);
    const found = ((data ?? []) as Array<Omit<IconRow, 'id'> & { id?: string; page_id?: string }>).map((r) => ({ ...r, id: (r.id ?? r.page_id)! }));
    if (!opts.draft || found.length === 0) return found.map((r) => ({ ...r, live: true }));
    const live = await client.from('cera_page_revisions').select('page_id').in('page_id', found.map((r) => r.id)).eq('is_published', true);
    if (live.error) fail(live.error);
    const liveIds = new Set((live.data as Array<{ page_id: string }>).map((r) => r.page_id));
    return found.map((r) => ({ ...r, live: liveIds.has(r.id) }));
  };

  const glyph = (r: IconRow & { live: boolean }): IconGlyph | null => {
    const svg = typeof r.boxes.icon?.svg === 'string' ? safeSvg(r.boxes.icon.svg) : '';
    if (!svg) return null;
    return { value: `custom:${r.id}`, label: r.title || 'Untitled icon', svg, ...(!r.live && { note: 'Not published' }) };
  };

  return {
    name: 'custom',
    label: opts.label ?? 'Your icons',

    async search(query, limit) {
      const words = queryWords(query);
      const scored: Array<[number, string, IconGlyph]> = [];
      for (const r of await rows()) {
        if (r.boxes.icon?.hidden === true) continue;
        const name = r.title.toLowerCase().trim().replace(/\s+/g, '-');
        const keywords = typeof r.boxes.icon?.keywords === 'string' ? queryWords(r.boxes.icon.keywords) : [];
        const score = matchScore(name, keywords, words);
        const g = score === null ? null : glyph(r);
        if (g) scored.push([score!, g.label, g]);
      }
      scored.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
      return scored.slice(0, limit).map(([, , g]) => g);
    },

    async get(names) {
      const ids = names.filter((n) => UUID.test(n));
      if (ids.length === 0) return [];
      return (await rows(ids)).map(glyph).filter((g): g is IconGlyph => g !== null);
    },
  };
}
