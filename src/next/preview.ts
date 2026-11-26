/**
 * Draft-mode preview route handlers.
 *
 * Preview from the admin, where the signed-in session is the authorization,
 * so the preview secret never reaches the browser:
 *
 *   // app/admin/preview/route.ts
 *   export const { GET } = createPreviewHandler({ authorize: async () => Boolean(await requireStaff()) });
 *
 * The admin sends a page's address (?path=/guides/setup, from `pageUrl`).
 *
 * Preview for outside tools, with a shared secret (?secret=…&slug=about):
 *
 *   // app/api/draft/route.ts
 *   export const { GET } = createPreviewHandler({ authorize: previewSecret(() => process.env.CERA_PREVIEW_SECRET) });
 *
 * An old version of a page (the admin's History links here with
 * ?slug=…&page=<id>&version=3): the preview remembers it in a cookie, and the
 * site's page loader shows that version of that page (see previewedVersion).
 *
 * Leaving preview, back to the same page (?path=/about):
 *
 *   // app/api/draft/disable/route.ts
 *   export const { GET } = createExitPreviewHandler();
 *
 * createCera (cera.tsx) sets this up for a site; use it directly only to
 * build an admin by hand.
 */
import { timingSafeEqual } from 'node:crypto';
import { cookies, draftMode } from 'next/headers';
import { redirect } from 'next/navigation';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The cookie that holds the old version being previewed: "<page id>:<version>". */
export const PREVIEW_VERSION_COOKIE = 'cera-preview-version';

/** The `page` and `version` parameters as a version to preview, or null. */
export function parsePreviewVersion(pageId: string | null | undefined, version: string | null | undefined): { pageId: string; version: number } | null {
  const number = Number(version);
  return pageId && UUID.test(pageId) && Number.isInteger(number) && number > 0 ? { pageId: pageId.toLowerCase(), version: number } : null;
}

/**
 * The old version being previewed, if any: read it in draft mode and show
 * that version when the page's id matches (getRevisionPage). Null otherwise.
 */
export async function previewedVersion(): Promise<{ pageId: string; version: number } | null> {
  if (!(await draftMode()).isEnabled) return null;
  const [pageId, version] = ((await cookies()).get(PREVIEW_VERSION_COOKIE)?.value ?? '').split(':');
  return parsePreviewVersion(pageId, version);
}

export interface PreviewHandlerOptions {
  /**
   * Whether this request may turn preview on. Return a Response to send it
   * instead (a redirect to sign in, say); Next's redirect() works too.
   */
  authorize: (request: Request) => boolean | Response | Promise<boolean | Response>;
  /** The page to show for a slug. Default: "/" for `home`, "/<slug>" otherwise. */
  pathFor?: (slug: string) => string;
}

export function defaultPreviewPath(slug: string): string {
  return slug === 'home' ? '/' : `/${slug}`;
}

/**
 * Turns on draft mode and sends the browser to `?path=` (a same-site path,
 * e.g. `/guides/setup`), else to the page for `?slug=` (default `home`).
 */
export function createPreviewHandler(options: PreviewHandlerOptions) {
  async function GET(request: Request): Promise<Response> {
    const allowed = await options.authorize(request);
    if (allowed instanceof Response) return allowed;
    if (!allowed) return new Response('Not allowed to preview.', { status: 401 });
    const params = new URL(request.url).searchParams;
    // The admin sends the page's own address (?path=/guides/setup); outside tools may send just its slug.
    const path = params.get('path');
    if (path !== null && returnPath(path) !== path) return new Response('Invalid path.', { status: 400 });
    const slug = params.get('slug') ?? 'home';
    if (path === null && !SLUG.test(slug)) return new Response('Invalid slug.', { status: 400 });
    const version = parsePreviewVersion(params.get('page'), params.get('version'));
    if ((params.has('page') || params.has('version')) && !version) return new Response('Invalid version.', { status: 400 });
    (await draftMode()).enable();
    const store = await cookies();
    // A plain preview shows working copies again.
    if (version) store.set(PREVIEW_VERSION_COOKIE, `${version.pageId}:${version.version}`, { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' });
    else store.delete(PREVIEW_VERSION_COOKIE);
    redirect(path ?? (options.pathFor ?? defaultPreviewPath)(slug));
  }
  return { GET };
}

/**
 * An `authorize` for outside tools: the request's `?secret=` must match the
 * secret, compared in constant time. With no secret set, nothing matches.
 */
export function previewSecret(secret: () => string | undefined) {
  return (request: Request): boolean => {
    const expected = secret();
    const given = new URL(request.url).searchParams.get('secret');
    if (!expected || !given) return false;
    const givenBytes = Buffer.from(given);
    const expectedBytes = Buffer.from(expected);
    return givenBytes.length === expectedBytes.length && timingSafeEqual(givenBytes, expectedBytes);
  };
}

/** A same-site path to return to, so the exit link can't be used as an open redirect. */
export function returnPath(path: string | null): string {
  return path && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : '/';
}

/** Turns off draft mode and goes back to `?path=` (default "/"). */
export function createExitPreviewHandler() {
  async function GET(request: Request): Promise<Response> {
    (await draftMode()).disable();
    (await cookies()).delete(PREVIEW_VERSION_COOKIE);
    redirect(returnPath(new URL(request.url).searchParams.get('path')));
  }
  return { GET };
}
