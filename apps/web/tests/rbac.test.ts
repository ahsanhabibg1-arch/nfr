import { describe, it, expect } from 'vitest';
import { roleHasPermission, buildEditorPermissions } from '../lib/auth/rbac';

describe('RBAC permission matrix (default-deny, server-enforced)', () => {
  it('Author: create/submit own only — cannot publish, delete, or edit others', () => {
    expect(roleHasPermission(['author'], 'cms.access')).toBe(true);
    expect(roleHasPermission(['author'], 'article.create')).toBe(true);
    expect(roleHasPermission(['author'], 'article.submit')).toBe(true);
    expect(roleHasPermission(['author'], 'article.edit.own')).toBe(true);
    expect(roleHasPermission(['author'], 'article.publish')).toBe(false);
    expect(roleHasPermission(['author'], 'article.approve')).toBe(false);
    expect(roleHasPermission(['author'], 'article.delete')).toBe(false);
    expect(roleHasPermission(['author'], 'article.edit.any')).toBe(false);
    expect(roleHasPermission(['author'], 'user.manage')).toBe(false);
  });

  it('Editor: review/approve/publish/schedule — but no delete, user management, or system config', () => {
    expect(roleHasPermission(['editor'], 'article.publish')).toBe(true);
    expect(roleHasPermission(['editor'], 'article.approve')).toBe(true);
    expect(roleHasPermission(['editor'], 'article.review')).toBe(true);
    expect(roleHasPermission(['editor'], 'article.edit.any')).toBe(true);
    expect(roleHasPermission(['editor'], 'article.delete')).toBe(false);
    expect(roleHasPermission(['editor'], 'user.manage')).toBe(false);
    expect(roleHasPermission(['editor'], 'seo.config')).toBe(false);
    expect(roleHasPermission(['editor'], 'system.config')).toBe(false);
  });

  it('Administrator: delete + user management + SEO config — but not system config', () => {
    expect(roleHasPermission(['administrator'], 'article.delete')).toBe(true);
    expect(roleHasPermission(['administrator'], 'user.manage')).toBe(true);
    expect(roleHasPermission(['administrator'], 'role.assign')).toBe(true);
    expect(roleHasPermission(['administrator'], 'seo.config')).toBe(true);
    expect(roleHasPermission(['administrator'], 'system.config')).toBe(false);
  });

  it('Super Admin: everything including system config', () => {
    for (const p of ['article.publish', 'article.delete', 'user.manage', 'role.assign', 'seo.config', 'system.config'] as const) {
      expect(roleHasPermission(['super_admin'], p)).toBe(true);
    }
  });

  it('SEO Manager: CMS access + SEO config only — no article create/edit/publish', () => {
    expect(roleHasPermission(['seo_manager'], 'cms.access')).toBe(true);
    expect(roleHasPermission(['seo_manager'], 'seo.config')).toBe(true);
    expect(roleHasPermission(['seo_manager'], 'article.create')).toBe(false);
    expect(roleHasPermission(['seo_manager'], 'article.edit.any')).toBe(false);
    expect(roleHasPermission(['seo_manager'], 'article.publish')).toBe(false);
    expect(roleHasPermission(['seo_manager'], 'user.manage')).toBe(false);
  });

  it('default-deny: no roles grants nothing', () => {
    expect(roleHasPermission([], 'cms.access')).toBe(false);
    expect(roleHasPermission([], 'article.publish')).toBe(false);
  });

  it('buildEditorPermissions reflects the role', () => {
    expect(buildEditorPermissions(['author'])).toMatchObject({ canPublish: false, canDelete: false, canSubmit: true });
    expect(buildEditorPermissions(['editor'])).toMatchObject({ canPublish: true, canApprove: true, canDelete: false });
    expect(buildEditorPermissions(['super_admin'])).toMatchObject({ canPublish: true, canDelete: true, canEditAny: true });
  });
});
