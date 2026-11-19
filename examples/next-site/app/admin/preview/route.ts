import { draftMode } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/auth.ts';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Preview from the admin: the signed-in session is the authorization, so the
 * preview secret never reaches the browser. (/api/draft?secret=… remains for
 * external tools.)
 */
export async function GET(request: Request) {
  await requireStaff();
  const slug = new URL(request.url).searchParams.get('slug') ?? 'home';
  if (!SLUG.test(slug)) return new Response('Invalid slug', { status: 400 });
  (await draftMode()).enable();
  redirect(slug === 'home' ? '/' : `/${slug}`);
}
