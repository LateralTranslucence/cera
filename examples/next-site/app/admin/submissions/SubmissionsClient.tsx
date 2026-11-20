'use client';
/** Client wrapper: the submissions list with this site's actions and filter links. */
import { useRouter } from 'next/navigation';
import { SubmissionList, type SubmissionListProps } from '@lateraltranslucence/cera/admin';
import { deleteSubmissionsAction } from '../actions.ts';

export function SubmissionsClient(props: Omit<SubmissionListProps, 'onFilter' | 'onDelete'>) {
  const router = useRouter();
  return (
    <SubmissionList
      {...props}
      onFilter={(formId) => router.push(formId ? `/admin/submissions?form=${formId}` : '/admin/submissions')}
      onDelete={async (input) => {
        const count = await deleteSubmissionsAction(input);
        router.refresh();
        return count;
      }}
    />
  );
}
