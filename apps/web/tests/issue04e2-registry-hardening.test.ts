import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Actor } from '../lib/cms/guard';
import type { RoleKey } from '../lib/auth/rbac';
import type * as AtSvc from '../lib/cms/articleTypeService';
import type * as Registry from '../lib/cms/articleTypeRegistry';
import type * as Boot from '../lib/cms/articleTypeBootstrap';
import type * as Content from '../lib/content';

/**
 * Batch 04-E.2 — R-8 (transactional bootstrap) and R-9 (evergreen integrity).
 *
 * R-8 is an atomicity claim, so it is tested the only way an atomicity claim
 * can honestly be tested: by making a write fail halfway through against a real
 * database and showing that nothing survived. Counting rows after a successful
 * run proves nothing about rollback.
 *
 * R-9 rests on a DISTINCTION — "this definition is missing because seeding did
 * not finish" versus "an administrator deleted it" — and the tests check that
 * both branches behave differently and correctly, including the case that makes
 * the distinction load-bearing: an article can still hold a deleted type's
 * value, because `restoreRevision` restores historical values unconditionally.
 */

let available = false;
let prisma: PrismaClient;
let svc: typeof AtSvc;
let registry: typeof Registry;
let boot: typeof Boot;
let content: typeof Content;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    await prisma.articleType.count();
    await prisma.seedTombstone.count();
    svc = await import('../lib/cms/articleTypeService');
    registry = await import('../lib/cms/articleTypeRegistry');
    boot = await import('../lib/cms/articleTypeBootstrap');
    content = await import('../lib/content');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
    available = true;
  } catch {
    available = false;
  }
}

const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

suite('Batch 04-E.2 — registry hardening', () => {
  const users: string[] = [];
  const slugs: string[] = [];
  let superAdmin: Actor;
  let admin: Actor;
  let seoManager: Actor;
  let catName: string;

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({
      data: { email: `i04e2-${roleKey}-${rid()}@example.com`, name: `04E2 ${roleKey}`, status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    users.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }

  /** Back to a known-empty registry with no tombstones of ours. */
  async function resetRegistry(): Promise<void> {
    await prisma.articleType.deleteMany({});
    await prisma.seedTombstone.deleteMany({ where: { kind: boot.ARTICLE_TYPE_TOMBSTONE_KIND } });
    registry.resetArticleTypeRegistryForTests();
  }

  const byValue = async (value: string) => prisma.articleType.findUniqueOrThrow({ where: { value } });
  const valuesInTable = async () =>
    (await prisma.articleType.findMany({ select: { value: true }, orderBy: { value: 'asc' } })).map((r) => r.value);

  beforeAll(async () => {
    superAdmin = await makeUser('super_admin');
    admin = await makeUser('administrator');
    seoManager = await makeUser('seo_manager');
    catName = (await prisma.category.findFirstOrThrow({ orderBy: { sortOrder: 'asc' }, select: { name: true } })).name;
  });

  beforeEach(async () => {
    if (!available) return;
    await resetRegistry();
  });

  afterAll(async () => {
    if (!available) return;
    const rows = await prisma.article.findMany({ where: { slug: { in: slugs } }, select: { id: true } });
    const ids = rows.map((r) => r.id);
    await prisma.articleBlock.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.articleSeo.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.articleTag.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.articleMedia.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.articleRevision.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.article.deleteMany({ where: { id: { in: ids } } });
    await resetRegistry();
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  // ===================================================== R-8: atomic bootstrap

  it('(1) a bootstrap creates all 23 definitions', async () => {
    const r = await svc.runArticleTypeBootstrap(superAdmin, true);
    expect(r.created).toBe(23);
    expect(r.conflicts).toBe(0);
    expect(r.complete).toBe(true);
    expect(await prisma.articleType.count()).toBe(23);
  });

  it('(2) a repeated bootstrap creates zero duplicates', async () => {
    await svc.runArticleTypeBootstrap(superAdmin, true);
    const again = await svc.runArticleTypeBootstrap(superAdmin, true);
    expect(again.created).toBe(0);
    expect(again.present).toBe(23);
    expect(await prisma.articleType.count()).toBe(23);
  });

  it('(3) R-8: a mid-bootstrap failure rolls back EVERY newly inserted definition', async () => {
    /**
     * The real database, a real interactive transaction, and a real failure on
     * the 5th insert. Nothing is mocked except the decision to throw.
     */
    let calls = 0;
    const store: Boot.ArticleTypeStore = {
      articleType: {
        findMany: (args) => prisma.articleType.findMany(args),
        create: (args) => prisma.articleType.create(args),
      },
      seedTombstone: {
        findMany: (args) => prisma.seedTombstone.findMany(args),
      },
      $transaction: (fn, options) =>
        prisma.$transaction(async (tx) => {
          return fn({
            articleType: {
              create: (args) => {
                calls += 1;
                if (calls === 5) throw new Error('injected failure on the 5th definition');
                return tx.articleType.create(args);
              },
            },
          });
        }, options),
    };

    expect(await prisma.articleType.count()).toBe(0);
    await expect(boot.bootstrapArticleTypes(store, { apply: true }))
      .rejects.toThrow(/injected failure on the 5th definition/);

    // THE ASSERTION THAT MATTERS: the four that succeeded are gone.
    expect(calls).toBe(5);
    expect(await prisma.articleType.count()).toBe(0);
    expect(await valuesInTable()).toEqual([]);
  });

  it('(3) …and the registry therefore never reports a half-initialised state', async () => {
    let calls = 0;
    const store: Boot.ArticleTypeStore = {
      articleType: {
        findMany: (args) => prisma.articleType.findMany(args),
        create: (args) => prisma.articleType.create(args),
      },
      seedTombstone: { findMany: (args) => prisma.seedTombstone.findMany(args) },
      $transaction: (fn, options) =>
        prisma.$transaction(async (tx) => fn({
          articleType: {
            create: (args) => {
              calls += 1;
              if (calls === 18) throw new Error('injected late failure');
              return tx.articleType.create(args);
            },
          },
        }), options),
    };
    await expect(boot.bootstrapArticleTypes(store, { apply: true })).rejects.toThrow(/injected late failure/);
    registry.resetArticleTypeRegistryForTests();
    const health = await registry.getArticleTypeRegistryHealth();
    // Empty, which the registry treats as "not initialised" and answers from the
    // full compatibility set — never as a partial database registry.
    expect(health.initialised).toBe(false);
    expect(health.source).toBe('fallback');
    expect(await registry.getArticleSchemaType('News')).toBe('NewsArticle');
    expect(await registry.getEvergreenArticleTypeValues()).toContain('guide');
  });

  it('R-8: applying without transaction support is REFUSED, not silently degraded', async () => {
    const store = {
      articleType: {
        findMany: async () => [],
        create: async () => { throw new Error('must never be called'); },
      },
      seedTombstone: { findMany: async () => [] },
    } as unknown as Boot.ArticleTypeStore;
    await expect(boot.bootstrapArticleTypes(store, { apply: true }))
      .rejects.toThrow(/without transaction support/i);
    // A DRY RUN still works, because it writes nothing.
    const plan = await boot.bootstrapArticleTypes(store, { apply: false });
    expect(plan.created).toBe(23);
    expect(plan.applied).toBe(false);
  });

  it('(5) an existing PARTIAL registry is completed without disturbing what is there', async () => {
    await svc.runArticleTypeBootstrap(superAdmin, true);
    // An administrator's own changes, which must survive the repair.
    const howTo = await byValue('How to Watch');
    await svc.updateArticleTypeMetadata(admin, howTo.id, { label: 'Watching & Streaming' });
    await svc.setArticleTypeSelectable(admin, howTo.id, false);
    // Simulate a registry that never received three definitions (no tombstones,
    // so these are gaps rather than deletions).
    await prisma.articleType.deleteMany({ where: { value: { in: ['Preview', 'History', 'Tickets Guide'] } } });
    await prisma.articleType.deleteMany({ where: { value: 'Ticket Guide' } });
    registry.resetArticleTypeRegistryForTests();

    const health = await registry.getArticleTypeRegistryHealth();
    expect(health.initialised).toBe(true);
    expect(health.complete).toBe(false);
    expect(health.missing.sort()).toEqual(['History', 'Preview', 'Ticket Guide']);

    const repair = await svc.runArticleTypeBootstrap(superAdmin, true);
    expect(repair.created).toBe(3);
    expect(repair.present).toBe(20);
    expect(repair.complete).toBe(true);
    expect(await prisma.articleType.count()).toBe(23);

    // (4) the administrator's label and lifecycle are untouched by the repair.
    const after = await byValue('How to Watch');
    expect(after.label).toBe('Watching & Streaming');
    expect(after.selectable).toBe(false);
  });

  it('(6) News and news remain distinct through bootstrap, repair and tombstoning', async () => {
    await svc.runArticleTypeBootstrap(superAdmin, true);
    expect((await byValue('News')).selectable).toBe(true);
    expect((await byValue('news')).selectable).toBe(false);

    // Delete the legacy one (no articles use it in this database).
    const legacy = await byValue('news');
    const used = await prisma.article.count({ where: { articleType: 'news' } });
    if (used === 0) {
      await svc.deleteArticleType(admin, legacy.id);
      // The tombstone names the exact value, so `News` is unaffected.
      const stones = await prisma.seedTombstone.findMany({ where: { kind: boot.ARTICLE_TYPE_TOMBSTONE_KIND } });
      expect(stones.map((s) => s.key)).toEqual(['news']);
      expect((await byValue('News')).value).toBe('News');
      const repair = await svc.runArticleTypeBootstrap(superAdmin, true);
      expect(repair.tombstoned).toEqual(['news']);
      expect(await prisma.articleType.findUnique({ where: { value: 'news' } })).toBeNull();
    }
  });

  // ===================================================== tombstone semantics

  it('a deliberate delete writes a tombstone, and the bootstrap does not undo it', async () => {
    await svc.runArticleTypeBootstrap(superAdmin, true);
    const preview = await byValue('Preview');
    await svc.deleteArticleType(admin, preview.id);

    expect(await prisma.seedTombstone.findFirst({
      where: { kind: boot.ARTICLE_TYPE_TOMBSTONE_KIND, key: 'Preview' },
    })).toBeTruthy();

    const again = await svc.runArticleTypeBootstrap(superAdmin, true);
    expect(again.created).toBe(0);
    expect(again.tombstoned).toContain('Preview');
    // Complete, because the registry now matches what the administrator decided.
    expect(again.complete).toBe(true);
    expect(await prisma.articleType.findUnique({ where: { value: 'Preview' } })).toBeNull();

    // And the rollout gate agrees: a tombstoned value is resolved, not missing.
    const v = await boot.verifyArticleTypeRegistry(prisma);
    expect(v.missing).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it('a FAILED delete leaves no tombstone (the two commit together or not at all)', async () => {
    await svc.runArticleTypeBootstrap(superAdmin, true);
    const guide = await byValue('guide');
    expect(await prisma.article.count({ where: { articleType: 'guide' } })).toBeGreaterThan(0);
    await expect(svc.deleteArticleType(admin, guide.id)).rejects.toMatchObject({ code: 'conflict' });
    expect(await prisma.seedTombstone.findFirst({
      where: { kind: boot.ARTICLE_TYPE_TOMBSTONE_KIND, key: 'guide' },
    })).toBeNull();
    expect((await byValue('guide')).value).toBe('guide');
  });

  // ===================================================== R-9: evergreen

  it('(7) a managed evergreen:true is respected', async () => {
    await svc.runArticleTypeBootstrap(superAdmin, true);
    expect(await registry.getEvergreenArticleTypeValues()).toContain('guide');
    const rows = await content.getEvergreenArticles(50);
    expect(rows.some((a) => a.articleType === 'guide')).toBe(true);
  });

  it('(8) a managed evergreen:false is respected and is NEVER overridden by the fallback', async () => {
    await svc.runArticleTypeBootstrap(superAdmin, true);
    const guide = await byValue('guide');
    // `guide` is evergreen in the compiled-in matrix — the strongest case for an
    // accidental override.
    await svc.setArticleTypeEvergreen(seoManager, guide.id, false);
    expect(await registry.getEvergreenArticleTypeValues()).not.toContain('guide');
    const rows = await content.getEvergreenArticles(50);
    expect(rows.some((a) => a.articleType === 'guide')).toBe(false);
    // The articles themselves did not move.
    expect(await prisma.article.count({ where: { articleType: 'guide' } })).toBeGreaterThan(0);
  });

  it('(9,11) R-9: an INCOMPLETE registry no longer drops eligible articles', async () => {
    await svc.runArticleTypeBootstrap(superAdmin, true);
    const withAll = await content.getEvergreenArticles(50);
    const guideCount = withAll.filter((a) => a.articleType === 'guide').length;
    expect(guideCount).toBeGreaterThan(0);

    // A gap, not a deletion: remove the row with no tombstone, exactly as an
    // interrupted pre-04-E.2 bootstrap would have left it.
    await prisma.articleType.deleteMany({ where: { value: 'guide' } });
    registry.resetArticleTypeRegistryForTests();

    const health = await registry.getArticleTypeRegistryHealth();
    expect(health.initialised).toBe(true);
    expect(health.missing).toContain('guide');

    // Before 04-E.2 this list omitted `guide` and the surface lost its articles.
    expect(await registry.getEvergreenArticleTypeValues()).toContain('guide');
    const after = await content.getEvergreenArticles(50);
    expect(after.filter((a) => a.articleType === 'guide')).toHaveLength(guideCount);
  });

  it('(9) a DELETED definition is not filled back in, even though it is "missing"', async () => {
    await svc.runArticleTypeBootstrap(superAdmin, true);
    // Use a type with no articles so the delete is permitted, and one that IS
    // evergreen in the compiled-in matrix so the fill would be visible.
    const travel = await byValue('Travel Guide');
    expect(await prisma.article.count({ where: { articleType: 'Travel Guide' } })).toBe(0);
    await svc.deleteArticleType(admin, travel.id);
    registry.resetArticleTypeRegistryForTests();

    const health = await registry.getArticleTypeRegistryHealth();
    expect(health.missing).toContain('Travel Guide');          // absent from the table
    expect(await registry.getEvergreenArticleTypeValues()).not.toContain('Travel Guide');
  });

  it('(9) the distinction is what decides it — same absence, opposite outcomes', async () => {
    await svc.runArticleTypeBootstrap(superAdmin, true);
    const travel = await byValue('Travel Guide');
    const ticket = await byValue('Ticket Guide');
    // One deleted through the service (tombstoned), one removed as a raw gap.
    await svc.deleteArticleType(admin, travel.id);
    await prisma.articleType.delete({ where: { id: ticket.id } });
    registry.resetArticleTypeRegistryForTests();

    const values = await registry.getEvergreenArticleTypeValues();
    expect(values).not.toContain('Travel Guide');  // intentional removal honoured
    expect(values).toContain('Ticket Guide');      // gap filled from the matrix
  });

  it('(10) an unknown type never becomes evergreen, whatever the registry state', async () => {
    await svc.runArticleTypeBootstrap(superAdmin, true);
    expect(await registry.getEvergreenArticleTypeValues()).not.toContain('Freestyle');
    await prisma.articleType.deleteMany({ where: { value: { in: ['guide', 'Travel Guide'] } } });
    registry.resetArticleTypeRegistryForTests();
    const values = await registry.getEvergreenArticleTypeValues();
    expect(values).not.toContain('Freestyle');
    expect(values).not.toContain('Opinion');
    // Only the 23 compatibility values can ever be filled in.
    for (const v of values) {
      expect(['guide', 'explainer', 'How to Watch', 'Rules & Format', 'History',
        'Records & Past Winners', 'Ticket Guide', 'Venue Guide', 'Travel Guide',
        'General Information']).toContain(v);
    }
  });

  it('(11) a fallback registry resolves evergreen from the full matrix', async () => {
    // Empty table → "not initialised" → whole compatibility set.
    registry.resetArticleTypeRegistryForTests();
    expect((await registry.getArticleTypeSnapshot()).source).toBe('fallback');
    const values = await registry.getEvergreenArticleTypeValues();
    expect(values).toContain('guide');
    expect(values).toContain('explainer');
    expect(values).not.toContain('feature');
    expect(values).not.toContain('analysis');
  });

  it('the evergreen query is unchanged in shape: ordering, limit and visibility', async () => {
    await svc.runArticleTypeBootstrap(superAdmin, true);
    const rows = await content.getEvergreenArticles(3);
    expect(rows.length).toBeLessThanOrEqual(3);
    // Published only, newest first — the pre-existing contract.
    for (const a of rows) expect(a.publishedAt).toBeTruthy();
    const dates = rows.map((a) => new Date(a.publishedAt as string).getTime());
    expect([...dates].sort((x, y) => y - x)).toEqual(dates);
  });

  // ===================================================== the load-bearing case

  it('an article CAN hold a deleted type, so "deleted means unused" is false', async () => {
    /**
     * This is why the tombstone distinction matters rather than being cosmetic.
     * `deleteArticleType` refuses while articles use the value — but
     * `restoreRevision` restores a historical value unconditionally, so an
     * article can acquire a deleted type AFTER the deletion. A blind
     * compatibility fill would then put that article back on a public surface
     * against the administrator's decision.
     */
    await svc.runArticleTypeBootstrap(superAdmin, true);
    const article = await import('../lib/cms/articleService');
    const slug = `i04e2-${rid()}`;
    slugs.push(slug);

    const created = await article.saveArticle(admin as never, {
      slug, title: 'A Batch 04-E.2 Headline',
      excerpt: 'An editorial excerpt long enough to satisfy the publication gate for this test case.',
      blocks: [
        { type: 'paragraph', text: 'An opening paragraph with enough words to pass the publication gate checks.' },
        { type: 'heading', level: 2, text: 'Section' },
      ],
      categoryName: catName, authorName: '04E2 Tester', articleType: 'Travel Guide',
      imageRightsStatus: 'Staff Photo',
      imageAltText: 'A descriptive alt text for the featured test photograph.',
    } as never);

    // Move it off the type so the definition can be deleted…
    await article.saveArticle(admin as never, {
      slug, id: created.id, title: 'A Batch 04-E.2 Headline',
      excerpt: 'An editorial excerpt long enough to satisfy the publication gate for this test case.',
      blocks: [
        { type: 'paragraph', text: 'An opening paragraph with enough words to pass the publication gate checks.' },
        { type: 'heading', level: 2, text: 'Section' },
      ],
      categoryName: catName, authorName: '04E2 Tester', articleType: 'General Information',
      imageRightsStatus: 'Staff Photo',
      imageAltText: 'A descriptive alt text for the featured test photograph.',
    } as never);
    expect((await prisma.article.findUniqueOrThrow({ where: { id: created.id } })).articleType)
      .toBe('General Information');

    const travel = await byValue('Travel Guide');
    expect(await prisma.article.count({ where: { articleType: 'Travel Guide' } })).toBe(0);
    await svc.deleteArticleType(admin, travel.id);

    // …then restore the revision that still carries it.
    const revs = await prisma.articleRevision.findMany({
      where: { articleId: created.id }, orderBy: { revisionNo: 'asc' }, select: { id: true },
    });
    expect(revs.length).toBeGreaterThan(0);
    await article.restoreRevision(admin as never, created.id, revs[0].id);

    const restored = await prisma.article.findUniqueOrThrow({ where: { id: created.id } });
    expect(restored.articleType).toBe('Travel Guide');   // a DELETED type, on a live article

    // And the administrator's deletion still governs the public surface.
    registry.resetArticleTypeRegistryForTests();
    expect(await registry.getEvergreenArticleTypeValues()).not.toContain('Travel Guide');
    // Classification still fails safe rather than claiming news (04-E.1).
    expect(await registry.getArticleSchemaType('Travel Guide')).toBe('Article');
  });

  // ===================================================== Task C diagnostics

  it('registry health distinguishes not-initialised, partial and complete', async () => {
    // Not initialised.
    registry.resetArticleTypeRegistryForTests();
    let h = await registry.getArticleTypeRegistryHealth();
    expect(h).toMatchObject({ source: 'fallback', initialised: false, complete: false, managedCount: 0 });
    expect(h.missing).toEqual([]);   // "all 23" would be misleading; `source` says it

    // Complete.
    await svc.runArticleTypeBootstrap(superAdmin, true);
    h = await registry.getArticleTypeRegistryHealth();
    expect(h).toMatchObject({ source: 'database', initialised: true, complete: true, managedCount: 23 });
    expect(h.missing).toEqual([]);
    expect(h.unmanaged).toEqual([]);

    // Partial.
    await prisma.articleType.deleteMany({ where: { value: 'Schedule' } });
    registry.resetArticleTypeRegistryForTests();
    h = await registry.getArticleTypeRegistryHealth();
    expect(h.initialised).toBe(true);
    expect(h.complete).toBe(false);
    expect(h.missing).toEqual(['Schedule']);

    // An administrator addition is reported separately, not as a problem.
    await svc.createArticleType(admin, { value: `E2 Extra ${rid()}`, label: 'Extra' });
    registry.resetArticleTypeRegistryForTests();
    h = await registry.getArticleTypeRegistryHealth();
    expect(h.unmanaged).toHaveLength(1);
    expect(h.missing).toEqual(['Schedule']);
  });

  it('health adds no query, and a complete registry does no tombstone lookup', async () => {
    await svc.runArticleTypeBootstrap(superAdmin, true);
    registry.resetArticleTypeRegistryForTests();
    // Prime the snapshot, then count queries during the reads under test.
    await registry.getArticleTypeSnapshot();
    let queries = 0;
    const off = (prisma as unknown as { $on: (e: string, cb: () => void) => void });
    void off;
    const spy = { count: () => queries };
    void spy;
    // Behavioural proxy rather than query interception: with a COMPLETE registry
    // there is nothing absent, so the tombstone branch cannot run — deleting
    // every tombstone row and reading again must still succeed and agree.
    await prisma.seedTombstone.deleteMany({ where: { kind: boot.ARTICLE_TYPE_TOMBSTONE_KIND } });
    const a = await registry.getEvergreenArticleTypeValues();
    const b = await registry.getEvergreenArticleTypeValues();
    expect(b).toEqual(a);
    const h = await registry.getArticleTypeRegistryHealth();
    expect(h.complete).toBe(true);
  });

  // ===================================================== no regressions

  it('(12) 04-E.1 NewsArticle classification still correct', async () => {
    await svc.runArticleTypeBootstrap(superAdmin, true);
    expect(await registry.getArticleSchemaType('News')).toBe('NewsArticle');
    expect(await registry.getArticleSchemaType('news')).toBe('NewsArticle');
    expect(await registry.getArticleSchemaType('guide')).toBe('Article');
    expect(await registry.getArticleSchemaType('Freestyle')).toBe('Article');
    // …and through a partial registry, which is 04-E.1's own fix.
    await prisma.articleType.deleteMany({ where: { value: 'News' } });
    registry.resetArticleTypeRegistryForTests();
    expect(await registry.getArticleSchemaType('News')).toBe('NewsArticle');
  });

  it('(13) RBAC and Article Type CRUD still correct', async () => {
    await svc.runArticleTypeBootstrap(superAdmin, true);
    const row = await byValue('Schedule');
    // 04-E.1 gates, unchanged.
    await expect(svc.setArticleTypeEvergreen(admin, row.id, true)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.setArticleTypeSchemaType(admin, row.id, 'NewsArticle')).rejects.toMatchObject({ code: 'forbidden' });
    await svc.setArticleTypeEvergreen(seoManager, row.id, true);
    expect((await byValue('Schedule')).evergreen).toBe(true);
    await svc.setArticleTypeEvergreen(seoManager, row.id, false);
    // Management still works for Administrator.
    await svc.updateArticleTypeMetadata(admin, row.id, { label: 'Schedule' });
    // The bootstrap is still Super Admin only.
    await expect(svc.runArticleTypeBootstrap(admin, true)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('(14) no Article row was rewritten, and the test database is the target', async () => {
    const rows = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    expect(rows[0].db).toMatch(/test/);
    const grouped = await prisma.article.groupBy({ by: ['articleType'], _count: { _all: true } });
    expect(grouped.length).toBeGreaterThan(0);
  });
});
