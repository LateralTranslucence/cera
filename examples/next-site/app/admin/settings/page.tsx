import { listCeraUsers } from '@lateraltranslucence/cera/supabase';
import { requireStaff } from '@/lib/auth.ts';
import { serviceClient } from '@/lib/supabase.ts';
import { saveApprovalSettingsAction } from '../actions.ts';
import { admin } from '../admin.ts';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  // Before listing accounts, which the secret key can always do.
  await requireStaff('admin');
  return <admin.SettingsScreen save={saveApprovalSettingsAction} users={await listCeraUsers(serviceClient())} />;
}
