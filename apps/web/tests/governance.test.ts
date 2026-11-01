import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as SettingsSvc from '../lib/cms/settingsService';
import type * as ArticleSvc from '../lib/cms/articleService';

/**
 * Batch 09 — system settings governance + FTS preservation (§27 items 17/24–32).
 * Settings RBAC + validation + persistence, audit-log authorization/filtering, safe
 * operational status, and the permanent full-text search regression (searchVector type,
 * GIN index, functional query on a fresh article). Self-skips without DATABASE_URL.
 */
let available = false;
let prisma: PrismaClient;
let settings: typeof SettingsSvc;
let article: typeof ArticleSvc;
let password: typeof import('../lib/auth/password');

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    available = true;
    settings = await import('../lib/cms/settingsService');
    article = await import('../lib/cms/articleService');
    password = await import('../lib/auth/password');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
  } catch {
    available = false;
  }
}
const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

suite('Batch 09 — system settings & FTS preservation', () => {
  const actors: Record<string, Actor> = {};
  const userIds: string[] = [];
  const articleIds: string[] = [];

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({ data: { email: `b9g-${roleKey}-${rid()}@example.com`, name: `B9G ${roleKey}`, status: 'ACTIVE', passwordHash: await password.hashPassword('correct horse battery staple x') } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    userIds.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }

  const validIdentity = {
    siteName: 'NFRGuide', tagline: 'Independent rodeo editorial', description: 'Coverage of the NFR.',
    contactEmail: 'desk@example.com', editorialEmail: '', twitterUrl: '', facebookUrl: '', instagramUrl: '',
  };

  beforeAll(async () => {
    actors.superadmin = await makeUser('super_admin');
    actors.editor = await makeUser('editor');
    actors.author = await makeUser('author');
  });

  afterAll(async () => {
    if (!available) return;
    for (const id of articleIds) await prisma.article.delete({ where: { id } }).catch(() => {});
    for (const id of userIds) {
      await prisma.userRole.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
  });

  it('enforces system.config on settings (Super Admin only)', async () => {
    await expect(settings.getSystemSettings(actors.editor)).rejects.toMatchObject({ code: 'forbidden' });
    const s = await settings.getSystemSettings(actors.superadmin);
    expect(s.siteIdentity.siteName).toBeTruthy();
  });

  it('validates and persists site identity; rejects HTML and bad URLs', async () => {
    await expect(settings.updateSiteIdentity(actors.superadmin, { ...validIdentity, siteName: '<script>x</script>' })).rejects.toBeTruthy();
    await expect(settings.updateSiteIdentity(actors.superadmin, { ...validIdentity, twitterUrl: 'not-a-url' })).rejects.toBeTruthy();
    await settings.updateSiteIdentity(actors.superadmin, { ...validIdentity, siteName: 'NFRGuide Edited' });
    const s = await settings.getSystemSettings(actors.superadmin);
    expect(s.siteIdentity.siteName).toBe('NFRGuide Edited');
  });

  it('persists editorial defaults', async () => {
    await settings.updateEditorialDefaults(actors.superadmin, {
      defaultArticleStatus: 'DRAFT', excerptGuidance: 'Keep it tight.', editorialTimeZone: 'UTC',
      wordsPerMinute: 240, inDepthWordCount: 1200, attributionGuidance: 'Cite sources.', sourceVerificationReminder: true,
    });
    const s = await settings.getSystemSettings(actors.superadmin);
    expect(s.editorial.wordsPerMinute).toBe(240);
    expect(s.editorial.editorialTimeZone).toBe('UTC');
  });

  it('reports safe operational status and declares security-critical values non-editable', async () => {
    const op = await settings.getOperationalStatus(actors.superadmin);
    expect(op.database.connected).toBe(true);
    expect((op.database.migrationsApplied ?? 0)).toBeGreaterThan(0);
    expect(op.analyticsCollection).toBe(false); // Batch 07 default preserved
    expect(op.adServing).toBe(false); // Batch 08 default preserved
    expect(op.securityNote.toLowerCase()).toContain('not editable');
    // No real secret VALUES or connection strings are exposed (the securityNote text,
    // which merely names what is *not* editable, is excluded from this scan).
    const scanned = JSON.stringify({ ...op, securityNote: '' });
    expect(scanned).not.toMatch(/postgres(ql)?:\/\//i);
    expect(scanned).not.toMatch(/passwordHash|tokenHash|\$2[aby]\$|secretKey|api[_-]?key/i);
  });

  it('restricts the audit log viewer and supports filtering', async () => {
    await expect(settings.listAuditLog(actors.editor, {})).rejects.toMatchObject({ code: 'forbidden' });
    const all = await settings.listAuditLog(actors.superadmin, { page: 1 });
    expect(all.total).toBeGreaterThan(0); // our settings writes above were audited
    const filtered = await settings.listAuditLog(actors.superadmin, { action: 'settings.site_identity' });
    expect(filtered.rows.every((r) => r.action.includes('settings.site_identity'))).toBe(true);
  });

  it('preserves PostgreSQL full-text search (searchVector type + GIN index + functional query)', async () => {
    const col = await prisma.$queryRaw<{ udt_name: string; is_generated: string }[]>`
      SELECT udt_name, is_generated FROM information_schema.columns WHERE table_name='Article' AND column_name='searchVector'`;
    expect(col[0]?.udt_name).toBe('tsvector');
    expect(col[0]?.is_generated).toBe('ALWAYS');

    const idx = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename='Article' AND indexname='Article_searchVector_idx'`;
    expect(/USING gin/i.test(idx[0]?.indexdef ?? '')).toBe(true);

    // Functional: a fresh article's generated vector matches a query for a coined title token.
    const token = 'zylophonium' + rid();
    const saved = await article.saveArticle(actors.author as ArticleSvc.ActorContext, {
      slug: `b9fts-${rid()}`, title: `${token} championship dispatch`,
      excerpt: 'A valid excerpt long enough to satisfy the publication gate checks for this FTS regression test case.',
      blocks: [{ type: 'paragraph', text: 'Opening paragraph with enough words to clear the minimum body length guidance threshold here now.' }],
      categoryName: 'NFR Competition', authorName: 'FTS Tester', imageRightsStatus: 'Staff Photo',
      imageAltText: 'Alt text for the FTS regression test photo.', seoTitle: 'Reasonable SEO Title For FTS Regression Case', metaDescription: 'A reasonable meta description within the configured guidance length for the FTS regression test.',
    } as ArticleSvc.ArticleInput);
    articleIds.push(saved.id);
    await prisma.article.update({ where: { id: saved.id }, data: { workflowStatus: 'PUBLISHED', publishedAt: new Date() } });
    const hit = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "Article" WHERE id = ${saved.id} AND "searchVector" @@ websearch_to_tsquery('english', ${token})`;
    expect(hit[0]?.n).toBe(1);
  });
});
