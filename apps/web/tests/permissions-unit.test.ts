import { describe, it, expect } from 'vitest';
import { CMS_MODULES, visibleModuleIds, buildPermissionMatrix } from '../lib/auth/permissions';
import { ROLE_PERMISSIONS, ALL_ROLES } from '../lib/auth/rbac';

/**
 * Batch 09 — permission registry + sidebar consistency (§8/§17/§18), no DB.
 */
describe('Batch 09 — permission registry', () => {
  it('every module view permission is a real, enforced permission', () => {
    const allPerms = new Set(Object.values(ROLE_PERMISSIONS).flat());
    for (const m of CMS_MODULES) expect(allPerms.has(m.view), `${m.id}:${m.view}`).toBe(true);
  });

  it('there are exactly the 15 CMS modules (12 base + venues/competitors + competition coverage)', () => {
    expect(CMS_MODULES.map((m) => m.id)).toEqual([
      'overview', 'articles', 'rodeo-coverage', 'venues', 'competitors', 'competition', 'editorial-organization', 'media', 'sources',
      'seo', 'website', 'analytics', 'monetization', 'team', 'settings',
    ]);
  });

  it('sidebar visibility matches the enforced permissions per role', () => {
    const sa = visibleModuleIds(['super_admin']);
    expect(sa).toContain('team');
    expect(sa).toContain('settings');
    expect(sa.length).toBe(15);

    const admin = visibleModuleIds(['administrator']);
    expect(admin).toContain('team');
    expect(admin).not.toContain('settings'); // system.config is Super Admin only

    for (const role of ['editor', 'author', 'seo_manager'] as const) {
      const vis = visibleModuleIds([role]);
      expect(vis, role).not.toContain('team');
      expect(vis, role).not.toContain('settings');
      expect(vis, role).toContain('overview');
    }
  });

  it('the permission matrix is generated from the enforced source of truth', () => {
    const matrix = buildPermissionMatrix();
    for (const g of matrix) {
      for (const row of g.rows) {
        for (const r of ALL_ROLES) {
          expect(row.roles[r]).toBe(ROLE_PERMISSIONS[r].includes(row.key));
        }
      }
    }
  });
});
