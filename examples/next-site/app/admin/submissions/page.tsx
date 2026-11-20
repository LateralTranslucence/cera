import { listPages, listSubmissions } from '@lateraltranslucence/cera/supabase';
import { formType } from '@/cera';
import { requireStaff } from '@/lib/auth.ts';
import { Shell } from '../Shell.tsx';
import { SubmissionsClient } from './SubmissionsClient.tsx';

export const metadata = { title: 'Submissions' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH = 50;

/** What visitors sent through forms. Admins and editors only: it's personal data. */
export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<{ form?: string; before?: string }> }) {
  const staff = await requireStaff('editor');
  const params = await searchParams;
  const formId = params.form && UUID.test(params.form) ? params.form : undefined;
  const before = params.before && !Number.isNaN(Date.parse(params.before)) ? params.before : undefined;

  const [forms, submissions] = await Promise.all([
    listPages(staff.client, { contentType: formType.name }),
    // One extra, to know whether there are older ones.
    listSubmissions(staff.client, { formId, before, limit: BATCH + 1 }),
  ]);
  const shown = submissions.slice(0, BATCH);
  const query = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ form: formId, ...extra }).filter((e): e is [string, string] => Boolean(e[1])));
    return q.size ? `?${q}` : '';
  };

  return (
    <Shell staff={staff} active="submissions">
      <div className="cera-screen">
        <div className="cera-screen__head">
          <div>
            <p className="cera-breadcrumb">Content</p>
            <h1 className="cera-screen__title">Submissions</h1>
          </div>
        </div>
        <SubmissionsClient
          key={`${formId ?? ''}-${before ?? ''}`}
          submissions={shown}
          forms={forms.map((f) => ({ id: f.id, title: f.title, slug: f.slug }))}
          formId={formId}
          csvHref={`/admin/submissions/export${query({})}`}
          olderHref={submissions.length > BATCH ? `/admin/submissions${query({ before: shown[shown.length - 1]!.createdAt })}` : undefined}
          newestHref={before ? `/admin/submissions${query({})}` : undefined}
        />
      </div>
    </Shell>
  );
}
