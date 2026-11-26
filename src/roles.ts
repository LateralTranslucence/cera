/**
 * Cera's roles, stored in a Supabase user's `app_metadata.cera_role`
 * (decision 17). Shared by the server helpers in ./supabase and the admin.
 */
export const CERA_ROLES = ['admin', 'editor', 'author', 'viewer'] as const;
export type CeraRole = (typeof CERA_ROLES)[number];

export const CERA_ROLE_LABELS: Record<CeraRole, string> = {
  admin: 'Admin: edits pages and manages people',
  editor: 'Editor: edits, publishes and uploads',
  author: 'Author: writes and uploads; someone else publishes',
  viewer: 'Viewer: reads the admin, changes nothing',
};

export function isCeraRole(value: unknown): value is CeraRole {
  return typeof value === 'string' && (CERA_ROLES as readonly string[]).includes(value);
}

/**
 * Whether someone with this role may write pages of a content type: an
 * admin, editor or author, and one the type's `editRoles` (theme:
 * restrict_users) names, when it names any. Publishing, unpublishing and
 * deleting need more: see `pageRights`.
 */
export function canEditContentType(role: CeraRole | null | undefined, contentType: { editRoles?: readonly CeraRole[] }): boolean {
  if (!roleAtLeast(role, 'author')) return false;
  return !contentType.editRoles || contentType.editRoles.includes(role!);
}

const ROLE_RANK: Record<CeraRole, number> = { viewer: 1, author: 2, editor: 3, admin: 4 };

/** Whether a role is at least `minimum`: admin > editor > author > viewer. */
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
