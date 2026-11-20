import { timingSafeEqual } from 'node:crypto';
import { draftMode } from 'next/headers';
import { redirect } from 'next/navigation';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function secretMatches(given: string | null): boolean {
  const expected = process.env.CERA_PREVIEW_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Enters draft mode: /api/draft?secret=…&slug=about. The admin will link here. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!secretMatches(url.searchParams.get('secret'))) {
    return new Response('Invalid preview secret', { status: 401 });
  }
  const slug = url.searchParams.get('slug') ?? 'home';
  if (!SLUG.test(slug)) return new Response('Invalid slug', { status: 400 });

  (await draftMode()).enable();
  redirect(slug === 'home' ? '/' : `/${slug}`);
}
