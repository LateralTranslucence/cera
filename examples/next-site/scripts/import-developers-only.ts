/**
 * Imports Developers Only's content (decision 22) from a running copy of the
 * WordPress site, through its REST API: the landing pages, simple pages and
 * forms, with their images uploaded to Cera's media library. A one-off, not a
 * general migration tool: it knows the theme's fields and maps each to Cera's.
 *
 *   npm run import:devo -w cera-next-site
 *   npm run import:devo -w cera-next-site -- --from http://localhost:8080 --draft
 *
 * Options:
 *   --from <url>        the WordPress site (default http://localhost:8080)
 *   --home-slug <slug>  where the theme's home page goes (default developers-only,
 *                       so the example site's own home page stays)
 *   --draft             save drafts instead of publishing
 *
 * Safe to run again: a page or form whose address is already taken is
 * updated in place (a new version), and images already in the library are
 * reused, not uploaded twice.
 *
 * It saves straight to the database, so the live site's cached pages show
 * the import within 5 minutes, or at once after anything is published in the
 * admin (which clears the cache). Draft-mode preview shows it straight away.
 */
import { createClient } from '@supabase/supabase-js';
import type { AnyContentType, MediaRef, StoredPage } from '@lateraltranslucence/cera';
import { toMediaRef } from '@lateraltranslucence/cera';
import { finishMediaUpload, listCeraUsers, MEDIA_BUCKET, mediaPathFor, mediaUrl, prepareMediaUpload, savePage } from '@lateraltranslucence/cera/supabase';
import { formType, landingPage, simplePage } from '../cera/index.ts';

const argument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index > -1 ? process.argv[index + 1] : undefined;
};
const from = (argument('--from') ?? 'http://localhost:8080').replace(/\/+$/, '');
const homeSlug = argument('--home-slug') ?? 'developers-only';
const mode = process.argv.includes('--draft') ? 'draft' : 'publish';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error('Run `npm run env` first to create .env.local.');
const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

/* ------------------------------------------------------------------ */
/* WordPress                                                           */
/* ------------------------------------------------------------------ */

type Fields = Record<string, unknown>;
interface WordPressPost {
  id: number;
  slug: string;
  post_title: string;
  status: string;
  fields: Fields;
}

async function wordpress(path: string): Promise<WordPressPost[]> {
  const response = await fetch(`${from}/wp-json/wp/v2/${path}?per_page=100`);
  if (!response.ok) throw new Error(`${from}/wp-json/wp/v2/${path} answered ${response.status}. Is the WordPress site running?`);
  return (await response.json()) as WordPressPost[];
}

/** The theme's post types, as Cera content types. */
const TYPES: Record<string, string> = { devo_landing_page: landingPage.name, devo_simple_page: simplePage.name, devo_form: formType.name };
/** The theme's background colors (api/fields/colors.php). */
const COLORS: Record<string, string> = { blue: '#2C25AB', navy: '#0D0B33', teal: '#17D6CA', white: '#FFFFFF', yellow: '#FFB400' };

const text = (value: unknown) => (typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value));
const optional = (value: unknown) => text(value).trim() || undefined;
const list = (value: unknown): Fields[] => (Array.isArray(value) ? (value.filter((item) => item && typeof item === 'object') as Fields[]) : []);
const plain = (html: string) => html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const warnings: string[] = [];
/** A repeater item: each needs its own id (the admin uses it to keep items apart while editing). */
const item = <Value extends object>(value: Value) => ({ _id: crypto.randomUUID(), ...value });

/* ------------------------------------------------------------------ */
/* Addresses: WordPress ids → Cera pages                               */
/* ------------------------------------------------------------------ */

interface Target {
  wordpressId: number;
  contentType: AnyContentType;
  slug: string;
  id: string;
  version: number;
}
const targets = new Map<number, Target>();
/** Where a WordPress page lives now, for links in copy and CTAs. */
const addresses = new Map<string, string>();

async function target(post: WordPressPost, contentType: AnyContentType, slug: string): Promise<Target> {
  const scope = contentType.slugScope ?? contentType.name;
  const { data, error } = await admin.from('cera_pages').select('id, version, content_type').eq('slug_scope', scope).eq('slug', slug).maybeSingle();
  if (error) throw error;
  if (data && data.content_type !== contentType.name) throw new Error(`/${slug} is already a ${data.content_type} in Cera; pick another address for "${post.post_title}".`);
  const found = { wordpressId: post.id, contentType, slug, id: (data?.id as string) ?? crypto.randomUUID(), version: (data?.version as number) ?? 0 };
  targets.set(post.id, found);
  return found;
}

/** A WordPress link, pointed at where its page lives in Cera. Other links are left alone. */
function rewriteUrl(value: string): string {
  if (!value.startsWith(from)) return value;
  const path = value.slice(from.length).replace(/\/+$/, '') || '/';
  return addresses.get(path) ?? path;
}

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

let userId = '';
const uploaded = new Map<string, MediaRef>();

/** The biggest size WordPress offers for an image (the theme's REST output lists every size). */
function biggest(media: Fields): { url: string; width?: number; height?: number } | null {
  let best: { url: string; width?: number; height?: number } | null = null;
  for (const size of Object.values(media)) {
    if (!size || typeof size !== 'object' || typeof (size as Fields).url !== 'string') continue;
    const candidate = size as { url: string; width?: number; height?: number };
    if (!best || (candidate.width ?? 0) > (best.width ?? 0)) best = candidate;
  }
  if (!best && typeof media.url === 'string') best = { url: media.url };
  return best;
}

/** Uploads a file from WordPress to the media library, or finds it there from an earlier run. */
async function upload(fileUrl: string, alt: string | undefined, size: { width?: number; height?: number }): Promise<MediaRef | undefined> {
  if (uploaded.has(fileUrl)) return uploaded.get(fileUrl);
  const response = await fetch(fileUrl);
  if (!response.ok) {
    warnings.push(`Couldn’t download ${fileUrl} (${response.status}); left out.`);
    return undefined;
  }
  const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim();
  const name = decodeURIComponent(new URL(fileUrl).pathname.split('/').pop() ?? 'file');
  const bytes = new Uint8Array(await response.arrayBuffer());

  // Already uploaded by an earlier run: same name (after the random part) and type.
  let reference: MediaRef | undefined;
  try {
    const suffix = mediaPathFor(name, type as never).split('/').pop()!.replace(/^[0-9a-f]+-/, '');
    const { data } = await admin.from('cera_media').select('id, path, kind, alt, width, height, mime_type').like('path', `%-${suffix}`).eq('mime_type', type).limit(1);
    const row = data?.[0] as { id: string; path: string; kind: MediaRef['kind']; alt?: string; width?: number; height?: number } | undefined;
    if (row) reference = toMediaRef({ id: row.id, path: row.path, kind: row.kind, alt: row.alt ?? undefined, width: row.width ?? undefined, height: row.height ?? undefined });
  } catch {
    // Not an uploadable type: prepareMediaUpload below says why.
  }

  if (!reference) {
    const prepared = await prepareMediaUpload(admin, { name, type, size: bytes.byteLength });
    if (!prepared.ok) {
      warnings.push(`Skipped ${name}: ${prepared.message}`);
      return undefined;
    }
    const sent = await admin.storage.from(MEDIA_BUCKET).uploadToSignedUrl(prepared.path, prepared.token, bytes, { contentType: type });
    if (sent.error) throw sent.error;
    const done = await finishMediaUpload(admin, { path: prepared.path, alt, width: size.width, height: size.height }, { userId });
    if (!done.ok) {
      warnings.push(`Skipped ${name}: ${done.message}`);
      return undefined;
    }
    reference = toMediaRef(done.item);
    console.log(`  uploaded ${name}`);
  }
  // Alt text is per use (decision 23).
  const used = { ...reference, ...(alt ? { alt } : {}) };
  uploaded.set(fileUrl, used);
  return used;
}

/** A theme media value (image, video or embed) as a Cera MediaRef. */
async function media(value: unknown, alt?: string): Promise<MediaRef | undefined> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const fields = value as Fields;
  const altText = alt ?? optional(fields.alt);
  if (fields.type === 'image' || fields.type === 'icon') {
    const file = biggest(fields);
    return file ? upload(file.url, altText, file) : undefined;
  }
  const address = optional(fields.url) ?? biggest(fields)?.url;
  if (!address) return undefined;
  if (address.startsWith(`${from}/wp-content/uploads/`)) return upload(address, altText, {});
  // A Vimeo or YouTube link: stored as typed, its address doubling as its id (as the admin does).
  return { id: address, path: address, kind: 'embed', ...(altText && { alt: altText }) };
}

/** Rich text: links to WordPress pages point at Cera, and images in it are uploaded. */
async function html(value: unknown): Promise<string> {
  let out = text(value);
  for (const match of [...out.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/g)]) {
    const source = match[1]!;
    if (!source.startsWith(`${from}/wp-content/uploads/`)) continue;
    const reference = await upload(source, undefined, {});
    if (reference) out = out.replaceAll(source, mediaUrl(reference));
  }
  return out.replace(/href="([^"]+)"/g, (_whole, href: string) => `href="${rewriteUrl(href)}"`).trim();
}

async function background(value: unknown) {
  const fields = (value && typeof value === 'object' ? value : {}) as Fields;
  const color = optional(fields.color);
  const image = await media(fields.media);
  return {
    ...(color && { color: COLORS[color] ?? color }),
    ...(image && { media: image }),
    overlay: fields.overlay === true,
  };
}

function cta(item: Fields | undefined) {
  if (!item || !optional(item.text)) return undefined;
  return { text: text(item.text).trim(), url: rewriteUrl(text(item.url).trim() || '#'), target: item.modal === true ? ('modal' as const) : ('_self' as const), ...(optional(item.button_style) && { style: text(item.button_style) }) };
}
const ctas = (value: unknown) => list(value).map(cta).filter((item) => item !== undefined);

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

const SORTS: Record<string, string> = { date: 'newest', date_desc: 'newest', newest: 'newest', date_asc: 'oldest', oldest: 'oldest', title: 'title', title_asc: 'title', title_desc: 'title-desc' };
const linked = (value: unknown) => {
  const ids = (Array.isArray(value) ? value : [value]).map((item) => (item && typeof item === 'object' ? (item as Fields).id : item)).map(Number);
  return ids.filter((id) => targets.has(id)).map((id) => targets.get(id)!.id);
};
const types = (value: unknown) => (Array.isArray(value) ? value : value ? [value] : []).map((name) => TYPES[text(name)]).filter((name): name is string => Boolean(name));

/** One theme panel (fields ending in _n) as Cera panel data, by panel type. */
async function panelData(type: string, field: (key: string) => unknown) {
  const frame = { title: optional(field('title')), background: await background(field('background')), copy: await html(field('copy')), anchorId: optional(field('id')) };
  switch (type) {
    case 'text':
      return { ...frame, overlay: field('overlay') === true, ctas: ctas(field('cta')) };
    case 'cta':
      return { ...frame, ctas: ctas(field('cta')) };
    case 'accordion':
      return { ...frame, items: await Promise.all(list(field('accordion_items')).map(async (entry) => item({ title: text(entry.title), text: await html(entry.text) }))), fullWidth: field('full_width') === true };
    case 'blocks':
      return {
        ...frame,
        blocks: await Promise.all(
          list(field('blocks')).map(async (entry) => {
            if (entry.icon && !Array.isArray(entry.icon)) warnings.push(`A block’s icon (“${text(entry.title)}”) wasn’t imported: theme icons are images; pick an icon in the admin.`);
            return item({ hidden: entry.hidden === true, media: await media(entry.media), title: optional(entry.title), copy: await html(entry.copy), cta: cta(entry) });
          }),
        ),
        perRow: Number(field('blocks_per_row')) || 3,
        style: field('block_style') === 'plain' ? 'plain' : 'card',
        ctas: ctas(field('cta')),
      };
    case 'decision-tree':
      return {
        ...frame,
        cards: await Promise.all(
          list(field('cards')).map(async (card) =>
            item({
              title: optional(card.title),
              overview: await html(card.overview),
              copy: await html(card.copy),
              cta: cta({ text: card.cta_text, url: card.cta_url }),
              list: await Promise.all(list(card.list).map(async (entry) => item({ icon: await media(entry.icon), title: optional(entry.title), url: optional(entry.url) && rewriteUrl(text(entry.url)) }))),
            }),
          ),
        ),
      };
    case 'featured-media':
      return { ...frame, media: await media(field('media')), imageLink: typeof field('image_link') === 'string' ? optional(field('image_link')) : undefined, fullWidth: field('fullwidth_svg') === true };
    case 'featured-post':
      return {
        anchorId: frame.anchorId,
        postTypes: types(field('post_type')),
        post: linked(field('post')),
        overrideImage: await media(field('override_image')),
        overridePretitle: optional(field('override_pretitle')),
        overrideTitle: optional(field('override_title')),
        overrideDescription: optional(field('override_description')),
        overrideCtaText: optional(field('override_cta_text')),
        overrideUrl: optional(field('override_url')),
        linkTarget: ['modal', '_blank'].includes(text(field('link_target'))) ? text(field('link_target')) : '_self',
      };
    case 'form':
      return { ...frame, form: linked(field('form')) };
    case 'gallery':
      return { ...frame, gallery: (await Promise.all(list(field('gallery')).map((item) => media(item.media, optional(item.title))))).filter(Boolean) };
    case 'posts':
      return { ...frame, postTypes: types(field('post_type')), posts: linked(field('posts')), perRow: Number(field('posts_per_row')) || 3, slider: field('slider') === true, ctas: ctas(field('cta')) };
    case 'quotes':
      return {
        ...frame,
        quotes: await Promise.all(list(field('quotes')).map(async (entry) => item({ quote: await html(entry.quote ?? entry.text), attribution: optional(entry.attribution ?? entry.name ?? entry.cite) }))),
        ctas: ctas(field('ctas')),
      };
    case 'search':
      return {
        ...frame,
        postTypes: types(field('search_post_types')),
        filters: list(field('search_fields')).map((entry) =>
          item({
            label: optional(entry.field_name),
            kind: ['search', 'alphabet', 'post_types', 'select_list'].includes(text(entry.field_type)) ? text(entry.field_type) : 'search',
            optionsType: TYPES[text(entry.options_post_type)],
            field: optional(entry.meta_field),
          }),
        ),
        perRow: Number(field('posts_per_row')) || 3,
        perPage: Number(field('posts_per_page')) || undefined,
        sortBy: list(field('custom_sort_by')).flatMap((row) => {
          const value = SORTS[text(row.value).toLowerCase()];
          if (!value) warnings.push(`Search sort “${text(row.value)}” has no Cera equivalent; left out.`);
          return value ? [item({ value, label: optional(row.label) })] : [];
        }),
        hideSortBy: field('hide_sort_by') === true,
      };
    case 'stats':
      return {
        ...frame,
        stats: list(field('stats')).map((entry) =>
          item({
            before: optional(plain(text(entry.before_number))),
            number: Number(entry.number) || 0,
            after: optional(plain(text(entry.after_number))),
            decimal: entry.decimal === true,
            countDown: entry.count_down === true,
            description: optional(plain(text(entry.description))),
          }),
        ),
      };
    case 'tabs':
      return {
        ...frame,
        tabs: await Promise.all(
          list(field('tabs')).map(async (entry) => item({ navLabel: optional(entry.nav_label), title: optional(entry.title), media: await media(entry.media), copy: await html(entry.copy), cta: cta(entry) })),
        ),
      };
    case 'text-media':
      return {
        ...frame,
        media: await media(field('media')),
        alignment: ['left', 'right', 'alternate'].includes(text(field('media_alignment'))) ? text(field('media_alignment')) : 'left',
        imageSize: ['small', 'medium', 'large'].includes(text(field('image_size'))) ? text(field('image_size')) : undefined,
        imageLink: typeof field('image_link') === 'string' ? optional(field('image_link')) : undefined,
        ctas: ctas(field('cta')),
      };
    default:
      return null;
  }
}

/** The numbered panels in a landing page's fields (page_panel_type_1, page_title_1…). */
async function panels(post: WordPressPost) {
  const fields = post.fields;
  const numbers = [...new Set(Object.keys(fields).flatMap((key) => (/^page_panel_type_(\d+)$/.exec(key) ? [Number(key.split('_').pop())] : [])))].sort((first, second) => first - second);
  const out: StoredPage['panels'] = [];
  for (const number of numbers) {
    const type = text(fields[`page_panel_type_${number}`]);
    const definition = landingPage.panels.find((panel) => panel.type === `cera/${type}`);
    const data = definition ? await panelData(type, (key) => fields[`page_${key}_${number}`]) : null;
    if (!definition || !data) {
      warnings.push(`${post.slug}: panel ${number} (“${type}”) has no Cera panel; left out.`);
      continue;
    }
    out.push({ id: `devo-${post.id}-${number}`, type: definition.type, v: definition.version, ...(fields[`page_hide_panel_${number}`] === true && { hidden: true }), data } as StoredPage['panels'][number]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Content types                                                       */
/* ------------------------------------------------------------------ */

async function landing(post: WordPressPost, where: Target): Promise<StoredPage> {
  const fields = post.fields;
  const isHome = post.slug === 'home';
  return {
    id: where.id,
    contentType: landingPage.name,
    slug: where.slug,
    title: isHome && where.slug !== 'home' ? 'Developers Only' : post.post_title,
    boxes: {
      hero: { title: optional(fields.page_title), background: await background(fields.page_background), copy: await html(fields.page_copy), ctas: ctas(fields.page_cta) },
      // SEO fields are plain text in Cera; the theme's could hold HTML.
      seo: { title: optional(plain(text(fields.page_seo_title))), description: optional(plain(text(fields.page_seo_description))), image: await media(fields.page_seo_image) },
      admin: {
        hidden: fields.page_hidden === true,
        noindex: fields.page_noindex === true,
        css: optional(fields.page_css),
        pageType: fields.page_landing_page_type === 'form' ? 'form' : 'landing-page',
        schemaType: ['WebPage', 'AboutPage', 'ContactPage', 'SearchResultsPage'].includes(text(fields.page_schema)) ? text(fields.page_schema) : 'WebPage',
        breadcrumbs: list(fields.page_breadcrumbs).map((entry) => item({ text: optional(entry.text), url: optional(entry.url) && rewriteUrl(text(entry.url)) })),
      },
    },
    panels: await panels(post),
  };
}

async function simple(post: WordPressPost, where: Target): Promise<StoredPage> {
  const fields = post.fields;
  return {
    id: where.id,
    contentType: simplePage.name,
    slug: where.slug,
    title: optional(fields.page_title) ?? post.post_title,
    boxes: {
      content: { image: await media(fields.page_image), imageCredit: optional(fields.page_image_credit), description: await html(fields.page_description), content: await html(fields.page_content) },
      seo: { image: await media(fields.page_seo_image) },
      admin: { hidden: fields.page_hidden === true },
    },
    panels: [],
  };
}

/** The theme's field types, as Cera's form field panels. */
const FIELD_TYPES: Record<string, string> = { text: 'text', email: 'email', phone: 'phone', tel: 'phone', textarea: 'textarea', select: 'select', radio: 'radio', button_select: 'button-select', checkbox: 'checkbox', binary: 'binary', toggle: 'toggle', range_slider: 'range', range: 'range', hidden: 'hidden' };

function form(post: WordPressPost, where: Target): StoredPage {
  const fields = post.fields;
  const count = Number(fields.form_field_count) || 0;
  const formFields: StoredPage['panels'] = [];
  for (let i = 1; i <= count; i++) {
    const kind = FIELD_TYPES[text(fields[`form_field_type_${i}`])];
    const definition = kind && formType.panels.find((panel) => panel.type === `cera/field-${kind}`);
    if (!definition) {
      warnings.push(`${post.slug}: field ${i} (“${text(fields[`form_field_type_${i}`])}”) has no Cera field; left out.`);
      continue;
    }
    formFields.push({
      id: `devo-${post.id}-field-${i}`,
      type: definition.type,
      v: definition.version,
      ...(fields[`form_hide_field_${i}`] === true && { hidden: true }),
      data: {
        label: text(fields[`form_label_${i}`]),
        name: optional(fields[`form_id_${i}`]),
        required: fields[`form_required_${i}`] === true,
        hideLabel: fields[`form_hide_label_${i}`] === true,
        ...(kind === 'text' && { autocomplete: optional(fields[`form_autocomplete_${i}`]) ?? 'none' }),
      },
    } as StoredPage['panels'][number]);
  }
  return {
    id: where.id,
    contentType: formType.name,
    slug: where.slug,
    title: optional(fields.form_form_name) ?? post.post_title,
    boxes: {
      settings: { submitText: optional(fields.form_submit_button_text) },
      onSubmit: { thankYouText: optional(fields.form_thank_you_text), thankYouRedirect: optional(fields.form_thank_you_redirect) },
    },
    panels: formFields,
  };
}

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

const staff = await listCeraUsers(admin);
const someone = staff.find((person) => person.role === 'admin') ?? staff.find((person) => person.role === 'editor');
if (!someone) throw new Error('No admin or editor in this Cera site to save as. Run the seed first.');
userId = someone.id;

const [landingPosts, simplePosts, formPosts] = await Promise.all([wordpress('landing-page'), wordpress('simple-page'), wordpress('form')]);
console.log(`From ${from}: ${landingPosts.length} landing pages, ${simplePosts.length} simple pages, ${formPosts.length} forms.`);

// Every page's new address first, so links and pickers can point at pages saved later.
for (const post of formPosts) await target(post, formType, optional(post.fields.form_form_id) ?? post.slug);
for (const post of simplePosts) {
  const where = await target(post, simplePage, optional(post.fields.page_slug) ?? post.slug);
  addresses.set(`/page/${post.slug}`, `/${where.slug}`);
}
for (const post of landingPosts) {
  const where = await target(post, landingPage, post.slug === 'home' ? homeSlug : (optional(post.fields.page_slug) ?? post.slug));
  addresses.set(`/${post.slug}`, where.slug === 'home' ? '/' : `/${where.slug}`);
}
if (homeSlug !== 'home') addresses.set('/', `/${homeSlug}`);

let failed = 0;
for (const [post, build] of [
  ...formPosts.map((post) => [post, () => form(post, targets.get(post.id)!)] as const),
  ...simplePosts.map((post) => [post, () => simple(post, targets.get(post.id)!)] as const),
  ...landingPosts.map((post) => [post, () => landing(post, targets.get(post.id)!)] as const),
]) {
  const where = targets.get(post.id)!;
  const page = await build();
  const result = await savePage(admin, where.contentType, page, { mode, expectedVersion: where.version, userId });
  if (!result.ok) {
    failed++;
    console.error(`Couldn’t save “${post.post_title}”:`, 'issues' in result ? result.issues.filter((issue) => issue.severity === 'error') : result);
    continue;
  }
  console.log(`${mode === 'publish' ? 'Published' : 'Saved'} ${where.contentType.label} “${page.title}” at ${where.contentType.route ? `/${where.slug}` : where.slug} (version ${result.version})`);
  for (const issue of result.issues) console.warn(`  ${issue.severity}: ${issue.path.join('.')} ${issue.message}`);
}
for (const warning of warnings) console.warn(`Note: ${warning}`);
if (failed) process.exitCode = 1;
