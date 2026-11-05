import { Permission, RoleKey, StaffRoleKey, ROLE_PERMISSIONS, ALL_ROLES, ROLE_LABELS, roleHasPermission } from './rbac';

/**
 * Centralized CMS permission registry (Batch 09 §8). A single, authoritative mapping
 * of the 12 CMS modules to the EXISTING permission that gates each module's view, plus
 * a module-grouped catalogue of permissions for the (real, not mocked) permission
 * matrix. This is metadata over `rbac.ts` — it adds NO new permission strings and does
 * not broaden any role. Server-side enforcement still lives in the page guards and the
 * per-module services; sidebar visibility is derived from the same map so the UI and
 * the server agree (hiding a link is never the security boundary).
 */
export interface CmsModule {
  id: string;
  label: string;
  path: string;
  /** Permission required to VIEW the module (mutations have their own finer checks). */
  view: Permission;
}

export const CMS_MODULES: CmsModule[] = [
  { id: 'overview', label: 'Overview', path: '/admin/', view: 'cms.access' },
  { id: 'articles', label: 'Articles', path: '/admin/articles/', view: 'cms.access' },
  { id: 'rodeo-coverage', label: 'Rodeo Coverage', path: '/admin/rodeo-coverage/', view: 'cms.access' },
  { id: 'venues', label: 'Venues', path: '/admin/venues/', view: 'cms.access' },
  { id: 'competitors', label: 'Competitors', path: '/admin/competitors/', view: 'cms.access' },
  { id: 'competition', label: 'Competition Coverage', path: '/admin/competition/', view: 'cms.access' },
  { id: 'editorial-organization', label: 'Organization & Taxonomy', path: '/admin/editorial-organization/', view: 'cms.access' },
  { id: 'comments', label: 'Comment Moderation', path: '/admin/comments/', view: 'comment.view' },
  { id: 'readers', label: 'Reader Accounts', path: '/admin/readers/', view: 'reader.view' },
  { id: 'media', label: 'Media Library', path: '/admin/media/', view: 'media.view' },
  { id: 'sources', label: 'Sources & References', path: '/admin/sources/', view: 'cms.access' },
  { id: 'seo', label: 'SEO Intelligence', path: '/admin/seo/', view: 'seo.audit.view' },
  { id: 'website', label: 'Website & Navigation', path: '/admin/website/', view: 'cms.access' },
  { id: 'analytics', label: 'Analytics & Search', path: '/admin/analytics/', view: 'analytics.view' },
  { id: 'monetization', label: 'Monetization & Ads', path: '/admin/monetization/', view: 'monetization.view' },
  { id: 'team', label: 'Team & Permissions', path: '/admin/team/', view: 'user.manage' },
  { id: 'settings', label: 'System Settings', path: '/admin/settings/', view: 'system.config' },
];

/** Module ids the given roles may view. Default-deny: a module whose `view` permission
 * no role holds is simply absent. */
export function visibleModuleIds(roles: RoleKey[]): string[] {
  return CMS_MODULES.filter((m) => roleHasPermission(roles, m.view)).map((m) => m.id);
}

export function canViewModule(roles: RoleKey[], moduleId: string): boolean {
  const m = CMS_MODULES.find((x) => x.id === moduleId);
  return !!m && roleHasPermission(roles, m.view);
}

// --- Module-grouped permission catalogue (for the real permission matrix UI) ---
export interface PermissionGroup {
  module: string;
  permissions: { key: Permission; label: string }[];
}

export const PERMISSION_CATALOGUE: PermissionGroup[] = [
  { module: 'Articles & Publishing', permissions: [
    { key: 'article.create', label: 'Create articles' },
    { key: 'article.edit.own', label: 'Edit own articles' },
    { key: 'article.edit.any', label: 'Edit any article' },
    { key: 'article.review', label: 'Review' },
    { key: 'article.approve', label: 'Approve' },
    { key: 'article.publish', label: 'Publish' },
    { key: 'article.schedule', label: 'Schedule' },
    { key: 'article.delete', label: 'Delete articles' },
  ] },
  { module: 'Rodeo, Taxonomy, Sources, Navigation', permissions: [
    { key: 'rodeo.manage', label: 'Manage rodeo coverage' },
    { key: 'taxonomy.manage', label: 'Manage taxonomy' },
    { key: 'source.manage', label: 'Manage sources' },
    { key: 'navigation.manage', label: 'Manage navigation' },
  ] },
  { module: 'Media', permissions: [
    { key: 'media.view', label: 'View media' },
    { key: 'media.upload', label: 'Upload media' },
    { key: 'media.edit.any', label: 'Edit any media' },
    { key: 'media.delete', label: 'Delete media' },
  ] },
  { module: 'SEO Intelligence', permissions: [
    { key: 'seo.audit.run', label: 'Run audits' },
    { key: 'seo.audit.view', label: 'View findings' },
    { key: 'seo.finding.manage', label: 'Manage findings' },
    { key: 'seo.config', label: 'Configure SEO' },
  ] },
  { module: 'Analytics & Search', permissions: [
    { key: 'analytics.view', label: 'View analytics' },
    { key: 'search.analytics.view', label: 'Search intelligence' },
    { key: 'analytics.config', label: 'Configure analytics' },
    { key: 'analytics.provider.manage', label: 'Manage providers' },
  ] },
  { module: 'Monetization', permissions: [
    { key: 'monetization.view', label: 'View monetization' },
    { key: 'monetization.partner.manage', label: 'Manage partners' },
    { key: 'monetization.link.manage', label: 'Manage links' },
    { key: 'monetization.config', label: 'Configure monetization' },
  ] },
  { module: 'Comment Moderation', permissions: [
    { key: 'comment.view', label: 'View reader comments' },
    { key: 'comment.moderate', label: 'Approve / reject / hide comments' },
    { key: 'comment.delete', label: 'Delete comments' },
  ] },
  { module: 'Reader Accounts', permissions: [
    { key: 'reader.view', label: 'View reader accounts' },
    { key: 'reader.manage', label: 'Suspend / activate / force-logout / delete readers' },
  ] },
  { module: 'Administration', permissions: [
    { key: 'user.manage', label: 'Manage team' },
    { key: 'role.assign', label: 'Assign roles' },
    { key: 'system.config', label: 'System settings' },
  ] },
];

export interface PermissionMatrixCell { key: Permission; label: string; roles: Record<RoleKey, boolean> }
export interface PermissionMatrixGroup { module: string; rows: PermissionMatrixCell[] }

/** Build the REAL matrix from ROLE_PERMISSIONS (the enforced source of truth). */
export function buildPermissionMatrix(): PermissionMatrixGroup[] {
  return PERMISSION_CATALOGUE.map((g) => ({
    module: g.module,
    rows: g.permissions.map((p) => ({
      key: p.key,
      label: p.label,
      roles: Object.fromEntries(ALL_ROLES.map((r) => [r, ROLE_PERMISSIONS[r].includes(p.key)])) as Record<RoleKey, boolean>,
    })),
  }));
}

export { ALL_ROLES, ROLE_LABELS };
export type { RoleKey, StaffRoleKey };
