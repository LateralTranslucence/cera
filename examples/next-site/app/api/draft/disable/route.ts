import { draftMode } from 'next/headers';
import { redirect } from 'next/navigation';

/** Leaves draft mode and goes back to the live page. */
export async function GET(request: Request) {
  (await draftMode()).disable();
  const back = new URL(request.url).searchParams.get('path') ?? '/';
  // Only same-site paths, so this can't be used as an open redirect.
  redirect(back.startsWith('/') && !back.startsWith('//') ? back : '/');
}
