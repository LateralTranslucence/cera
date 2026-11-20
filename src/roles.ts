/**
 * Cera's roles, stored in a Supabase user's `app_metadata.cera_role`
 * (decision 17). Shared by the server helpers in ./supabase and the admin.
 */
export const CERA_ROLES = ['admin', 'editor', 'viewer'] as const;
export type CeraRole = (typeof CERA_ROLES)[number];

export const CERA_ROLE_LABELS: Record<CeraRole, string> = {
  admin: 'Admin: edits pages and manages people',
  editor: 'Editor: edits, publishes and uploads',
  viewer: 'Viewer: reads the admin, changes nothing',
};

export function isCeraRole(value: unknown): value is CeraRole {
  return typeof value === 'string' && (CERA_ROLES as readonly string[]).includes(value);
}

/** An account as the Users page shows it. */
export interface CeraUser {
  id: string;
  email: string;
  role: CeraRole | null;
  createdAt?: string;
  lastSignInAt?: string;
}
