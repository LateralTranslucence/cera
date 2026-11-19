import { listPages } from '@lateraltranslucence/cera/supabase';
import { landingPage } from '@/cera';
import { canEdit, requireStaff } from '@/lib/auth.ts';
import { Shell } from './Shell.tsx';

export const metadata = { title: 'Pages' };

const dateFormat = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' });

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const staff = await requireStaff();
  const { error } = await searchParams;
  const pages = await listPages(staff.client, { contentType: landingPage.name });

  return (
    <Shell staff={staff}>
      <div className="cera-page-head">
        <h1>{landingPage.label}s</h1>
        {canEdit(staff.role) && (
          <a className="cera-button cera-button--primary" href="/admin/pages/new">
            New page
          </a>
        )}
      </div>
      {error === 'forbidden' && <p className="cera-status cera-status--error">Your role can’t do that.</p>}
      {pages.length === 0 ? (
        <p className="cera-note">No pages yet.</p>
      ) : (
        <table className="cera-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Address</th>
              <th>Status</th>
              <th className="cera-hide-sm">Last saved</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr key={p.id}>
                <td>
                  <a href={`/admin/pages/${p.id}`}>{p.title || 'Untitled'}</a>
                </td>
                <td>{p.slug === 'home' ? '/' : `/${p.slug}`}</td>
                <td>{p.published ? 'Published' : 'Draft only'}</td>
                <td className="cera-hide-sm">{dateFormat.format(new Date(p.updatedAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Shell>
  );
}
