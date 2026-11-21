import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function environmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };

/** Anonymous client: can only read published pages (row-level security). */
export function publicClient(): SupabaseClient {
  return createClient(environmentVariable('NEXT_PUBLIC_SUPABASE_URL'), environmentVariable('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), options);
}

/**
 * Secret-key client: bypasses row-level security. Server only. Used for
 * draft-mode preview (already gated by Next's draft-mode cookie) and, in the
 * admin, for `savePage`.
 */
export function serviceClient(): SupabaseClient {
  return createClient(environmentVariable('NEXT_PUBLIC_SUPABASE_URL'), environmentVariable('SUPABASE_SECRET_KEY'), options);
}
