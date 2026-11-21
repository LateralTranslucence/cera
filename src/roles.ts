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

/**
 * Whether someone with this role may create, edit, publish or delete pages
 * of a content type: an admin or editor, and one the type's `editRoles`
 * (theme: restrict_users) names, when it names any.
 */
export function canEditContentType(role: CeraRole | null | undefined, contentType: { editRoles?: readonly CeraRole[] }): boolean {
  if (role !== 'admin' && role !== 'editor') return false;
  return !contentType.editRoles || contentType.editRoles.includes(role);
}

const ROLE_RANK: Record<CeraRole, number> = { viewer: 1, editor: 2, admin: 3 };

/** Whether a role is at least `minimum`: admin > editor > viewer. */
export function roleAtLeast(role: CeraRole | null | undefined, minimum: CeraRole): boolean {
  return Boolean(role) && ROLE_RANK[role!] >= ROLE_RANK[minimum];
}

/** An account as the Users page shows it. */
export interface CeraUser {
  id: string;
  email: string;
  role: CeraRole | null;
  createdAt?: string;
  lastSignInAt?: string;
}
