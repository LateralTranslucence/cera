/**
 * Draft-mode preview route handlers.
 *
 * Preview from the admin, where the signed-in session is the authorization,
 * so the preview secret never reaches the browser:
 *
 *   // app/admin/preview/route.ts
 *   export const { GET } = createPreviewHandler({ authorize: async () => Boolean(await requireStaff()) });
 *
 * Preview for outside tools, with a shared secret (?secret=…&slug=about):
 *
 *   // app/api/draft/route.ts
 *   export const { GET } = createPreviewHandler({ authorize: previewSecret(() => process.env.CERA_PREVIEW_SECRET) });
 *
 * Leaving preview, back to the same page (?path=/about):
 *
 *   // app/api/draft/disable/route.ts
 *   export const { GET } = createExitPreviewHandler();
 */
import { timingSafeEqual } from 'node:crypto';
import { draftMode } from 'next/headers';
import { redirect } from 'next/navigation';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

/** Turns on draft mode and sends the browser to the page for `?slug=` (default `home`). */
export function createPreviewHandler(options: PreviewHandlerOptions) {
  async function GET(request: Request): Promise<Response> {
    const allowed = await options.authorize(request);
    if (allowed instanceof Response) return allowed;
    if (!allowed) return new Response('Not allowed to preview.', { status: 401 });
    const slug = new URL(request.url).searchParams.get('slug') ?? 'home';
    if (!SLUG.test(slug)) return new Response('Invalid slug.', { status: 400 });
    (await draftMode()).enable();
    redirect((options.pathFor ?? defaultPreviewPath)(slug));
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
    redirect(returnPath(new URL(request.url).searchParams.get('path')));
  }
  return { GET };
}
