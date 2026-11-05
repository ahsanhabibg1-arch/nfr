/**
 * Five-role RBAC permission matrix (Batch 03 §5), the single source of truth for
 * server-side enforcement. Mirrors the approved PERMISSION_MATRIX (AdminTeamPage)
 * and the Master Requirements §5.1/§6/§10. Default-deny: a permission not listed
 * for a role is not granted. This module is safe to import on the client for
 * cosmetic control-hiding, but it is NEVER the enforcement point — every mutation
 * re-checks on the server.
 */
// Staff roles have CMS access; `reader` (Batch 24) is a public-registration identity with
// ZERO admin permissions. Readers can never reach the Admin CMS (default-deny RBAC).
export type RoleKey = 'super_admin' | 'administrator' | 'editor' | 'author' | 'seo_manager' | 'reader';

/** Staff roles only (the CMS-capable set) — excludes the public `reader` identity.
 *  Use this wherever a value must be an assignable *staff* role (e.g. team management). */
export type StaffRoleKey = Exclude<RoleKey, 'reader'>;

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
  | 'seo.finding.manage'
  // Batch 07 Analytics & Search permissions (owner-approved; see ANALYTICS_RBAC_MATRIX.md)
  | 'analytics.view'
  | 'analytics.config'
  | 'analytics.export'
  | 'search.analytics.view'
  | 'search.config'
  | 'analytics.provider.manage'
  // Batch 08 Monetization permissions (owner-approved; see MONETIZATION_RBAC_MATRIX.md)
  | 'monetization.view'
  | 'monetization.partner.manage'
  | 'monetization.link.manage'
  | 'monetization.placement.manage'
  | 'monetization.disclosure.manage'
  | 'monetization.config'
  | 'monetization.report.view'
  // Batch 24 comment moderation permissions
  | 'comment.view'
  | 'comment.moderate'
  | 'comment.delete'
  // Batch 24 reader-account administration (Admin/Super Admin only)
  | 'reader.view'
  | 'reader.manage';

// Staff roles only (assignable in the Admin Team module + used for admin-role display).
// `reader` is deliberately NOT here — it is assigned by public registration, never in the CMS.
export const ALL_ROLES: RoleKey[] = ['super_admin', 'administrator', 'editor', 'author', 'seo_manager'];

export const ROLE_LABELS: Record<RoleKey, string> = {
  super_admin: 'Super Admin',
  administrator: 'Administrator',
  editor: 'Editor',
  author: 'Author',
  seo_manager: 'SEO Manager',
  reader: 'Reader',
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
  // Analytics (Batch 07) — Editors view editorial analytics + internal-search insights
  'analytics.view', 'search.analytics.view',
  // Monetization (Batch 08) — Editors view partners/links + reports; they assign
  // approved links/disclosures to content via their existing article-edit rights.
  'monetization.view', 'monetization.report.view',
  // Comment moderation (Batch 24) — Editors+ can view + approve/reject/hide reader comments.
  'comment.view', 'comment.moderate',
];

const ADMIN_PERMS: Permission[] = [
  ...EDITOR_PERMS, 'article.delete', 'seo.config', 'user.manage', 'role.assign',
  // Comment deletion — Admin/Super Admin only (Batch 24)
  'comment.delete',
  // Reader-account administration — Admin/Super Admin only (Batch 24): view, suspend/
  // activate, force-logout, delete registered reader accounts. Editors do NOT get this.
  'reader.view', 'reader.manage',
  // Site structure (Batch 04) — Admin/Super Admin only
  'navigation.manage',
  // Media deletion — Admin/Super Admin only (Batch 05)
  'media.delete',
  // Analytics config/export/provider + search config — Admin/Super Admin (Batch 07).
  // analytics.config gates privacy-sensitive collection + retention controls.
  'analytics.config', 'analytics.export', 'search.config', 'analytics.provider.manage',
  // Monetization operational management — Admin/Super Admin (Batch 08).
  'monetization.partner.manage', 'monetization.link.manage', 'monetization.placement.manage',
  'monetization.disclosure.manage', 'monetization.config',
];

export const ROLE_PERMISSIONS: Record<RoleKey, Permission[]> = {
  super_admin: [...ADMIN_PERMS, 'system.config'],
  administrator: ADMIN_PERMS,
  editor: EDITOR_PERMS,
  author: ['cms.access', 'article.create', 'article.edit.own', 'article.submit',
    // Media: browse, add to the library, manage own, attach to own articles
    'media.view', 'media.upload', 'media.edit.own', 'media.assign',
    // SEO (Batch 06): view findings for OWN articles only (scoped in the service)
    'seo.audit.view',
    // Analytics (Batch 07): own-article performance only (scoped in the service)
    'analytics.view',
    // Monetization (Batch 08): view approved commercial assets; propose placements
    // on own articles via article-edit rights. No partner/link/config management.
    'monetization.view'],
  seo_manager: ['cms.access', 'seo.config',
    // Media: browse + edit image SEO/alt metadata on any asset (no upload/delete)
    'media.view', 'media.edit.any',
    // SEO (Batch 06): full SEO operations
    'seo.audit.run', 'seo.audit.view', 'seo.finding.manage',
    // Analytics (Batch 07): analytics + search intelligence, search config, provider
    // connection management, export — but no unrelated system administration.
    'analytics.view', 'analytics.export', 'search.analytics.view', 'search.config', 'analytics.provider.manage',
    // Monetization (Batch 08): view + commercial SEO/compliance diagnostics only;
    // no financial/provider/partner/link configuration.
    'monetization.view', 'monetization.report.view'],
  // Reader (Batch 24): a public identity with NO admin permissions. Commenting is gated
  // by "authenticated + active" in the service, not by an RBAC permission, so readers
  // need none here. roleHasPermission(['reader'], <anything>) is always false.
  reader: [],
};

/** True when the user holds any staff (CMS) access — used to show/hide the Admin link. */
export function isStaff(roles: RoleKey[]): boolean {
  return roleHasPermission(roles, 'cms.access');
}

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
