'use client';
/**
 * Client wrapper: gives the package's PageEditor this site's content type
 * (which holds functions, so it can't be passed from a Server Component) and
 * the server actions.
 */
import { useRouter } from 'next/navigation';
import type { StoredPage } from '@lateraltranslucence/cera';
import { PageEditor } from '@lateraltranslucence/cera/admin';
import { contentTypes } from '@/cera';
import { savePageAction, unpublishPageAction } from '../actions.ts';

export function EditorClient({
  page,
  version,
  published,
  readOnly,
}: {
  page: StoredPage;
  version: number;
  published: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();
  const ct = contentTypes.find((c) => c.name === page.contentType);
  if (!ct) return <p className="cera-status cera-status--error">This site has no content type “{page.contentType}”.</p>;

  return (
    <PageEditor
      contentType={ct}
      contentTypes={contentTypes.map((c) => ({ name: c.name, label: c.label, public: true }))}
      page={page}
      version={version}
      published={published}
      readOnly={readOnly}
      onSave={savePageAction}
      onUnpublish={async () => {
        await unpublishPageAction(page.id);
      }}
      onSaved={() => {
        // A new page lives at /admin/pages/new until its first save.
        if (version === 0) router.replace(`/admin/pages/${page.id}`);
      }}
      previewHref={(slug) => `/admin/preview?slug=${encodeURIComponent(slug)}`}
    />
  );
}
