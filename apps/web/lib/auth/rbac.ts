/**
 * Five-role RBAC permission matrix (Batch 03 §5), the single source of truth for
 * server-side enforcement. Mirrors the approved PERMISSION_MATRIX (AdminTeamPage)
 * and the Master Requirements §5.1/§6/§10. Default-deny: a permission not listed
 * for a role is not granted. This module is safe to import on the client for
 * cosmetic control-hiding, but it is NEVER the enforcement point — every mutation
 * re-checks on the server.
 */
export type RoleKey = 'super_admin' | 'administrator' | 'editor' | 'author' | 'seo_manager';

export type Permission =
  | 'cms.access'
  | 'article.create'
  | 'article.edit.own'
  | 'article.edit.any'
  | 'article.submit'
  | 'article.review'
  | 'article.approve'
  | 'article.publish'
  | 'article.schedule'
  | 'article.delete'
  | 'seo.config'
  | 'user.manage'
  | 'role.assign'
  | 'system.config'
  // Batch 04 module permissions (proposed; see RBAC_PERMISSION_MATRIX.md)
  | 'rodeo.manage'
  | 'taxonomy.manage'
  | 'author.manage'
  | 'source.manage'
  | 'navigation.manage';

export const ALL_ROLES: RoleKey[] = ['super_admin', 'administrator', 'editor', 'author', 'seo_manager'];

export const ROLE_LABELS: Record<RoleKey, string> = {
  super_admin: 'Super Admin',
  administrator: 'Administrator',
  editor: 'Editor',
  author: 'Author',
  seo_manager: 'SEO Manager',
};

const EDITOR_PERMS: Permission[] = [
  'cms.access', 'article.create', 'article.edit.own', 'article.edit.any',
  'article.submit', 'article.review', 'article.approve', 'article.publish', 'article.schedule',
  // Editorial content management (Batch 04)
  'rodeo.manage', 'taxonomy.manage', 'author.manage', 'source.manage',
];

const ADMIN_PERMS: Permission[] = [
  ...EDITOR_PERMS, 'article.delete', 'seo.config', 'user.manage', 'role.assign',
  // Site structure (Batch 04) — Admin/Super Admin only
  'navigation.manage',
];

export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  super_admin: [...ADMIN_PERMS, 'system.config'],
  administrator: ADMIN_PERMS,
  editor: EDITOR_PERMS,
  author: ['cms.access', 'article.create', 'article.edit.own', 'article.submit'],
  seo_manager: ['cms.access', 'seo.config'],
};

export function roleHasPermission(roles: RoleKey[], perm: Permission): boolean {
  return roles.some((r) => ROLE_PERMISSIONS[r]?.includes(perm));
}

/** Highest-privilege label for display. */
export function primaryRoleLabel(roles: RoleKey[]): string {
  for (const r of ALL_ROLES) if (roles.includes(r)) return ROLE_LABELS[r];
  return 'No Role';
}

export interface EditorPermissionSet {
  canSubmit: boolean;
  canReview: boolean;
  canApprove: boolean;
  canPublish: boolean;
  canSchedule: boolean;
  canDelete: boolean;
  canEditAny: boolean;
}

/** Derive the editor's capability flags from the user's roles. */
export function buildEditorPermissions(roles: RoleKey[]): EditorPermissionSet {
  return {
    canSubmit: roleHasPermission(roles, 'article.submit'),
    canReview: roleHasPermission(roles, 'article.review'),
    canApprove: roleHasPermission(roles, 'article.approve'),
    canPublish: roleHasPermission(roles, 'article.publish'),
    canSchedule: roleHasPermission(roles, 'article.schedule'),
    canDelete: roleHasPermission(roles, 'article.delete'),
    canEditAny: roleHasPermission(roles, 'article.edit.any'),
  };
}
