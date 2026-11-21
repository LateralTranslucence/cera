'use client';
/** Client wrapper: the Forms list, with each form's submissions. */
import { PageList } from '@lateraltranslucence/cera/admin';
import type { PageSummary } from '@lateraltranslucence/cera/supabase';

export function FormListClient({ forms, counts }: { forms: PageSummary[]; counts: Record<string, { total: number }> | null }) {
  return (
    <PageList
      pages={forms}
      editHref={(form) => `/admin/forms/${form.id}`}
      noun="form"
      countLabel="Fields"
      slugs="id"
      {...(counts && {
        extra: {
          label: 'Submissions',
          render: (form: PageSummary) => {
            const total = counts[form.id]?.total ?? 0;
            return total > 0 ? <a href={`/admin/submissions?form=${form.id}`}>{total}</a> : '0';
          },
        },
      })}
    />
  );
}
