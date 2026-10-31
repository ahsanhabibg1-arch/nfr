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
  | 'navigation.manage'
  // Batch 05 media permissions (owner-approved; see RBAC_PERMISSION_MATRIX.md)
  | 'media.view'
  | 'media.upload'
  | 'media.edit.own'
  | 'media.edit.any'
  | 'media.delete'
  | 'media.assign'
  // Batch 06 SEO Intelligence permissions (owner-approved; see SEO_RBAC_MATRIX.md)
  | 'seo.audit.run'
  | 'seo.audit.view'
  | 'seo.finding.manage';

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
  // Media (Batch 05) — full except delete (Admin+)
  'media.view', 'media.upload', 'media.edit.own', 'media.edit.any', 'media.assign',
  // SEO Intelligence (Batch 06) — run content-level audits, view, manage findings
  'seo.audit.run', 'seo.audit.view', 'seo.finding.manage',
];

const ADMIN_PERMS: Permission[] = [
  ...EDITOR_PERMS, 'article.delete', 'seo.config', 'user.manage', 'role.assign',
  // Site structure (Batch 04) — Admin/Super Admin only
  'navigation.manage',
  // Media deletion — Admin/Super Admin only (Batch 05)
  'media.delete',
];

export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  super_admin: [...ADMIN_PERMS, 'system.config'],
  administrator: ADMIN_PERMS,
  editor: EDITOR_PERMS,
  author: ['cms.access', 'article.create', 'article.edit.own', 'article.submit',
    // Media: browse, add to the library, manage own, attach to own articles
    'media.view', 'media.upload', 'media.edit.own', 'media.assign',
    // SEO (Batch 06): view findings for OWN articles only (scoped in the service)
    'seo.audit.view'],
  seo_manager: ['cms.access', 'seo.config',
    // Media: browse + edit image SEO/alt metadata on any asset (no upload/delete)
    'media.view', 'media.edit.any',
    // SEO (Batch 06): full SEO operations
    'seo.audit.run', 'seo.audit.view', 'seo.finding.manage'],
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
