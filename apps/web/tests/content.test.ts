import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient, WorkflowStatus } from '@prisma/client';

/**
 * Database integration tests (Batch 02 §13).
 *
 * These exercise the REAL repository + Prisma against a live database. They
 * self-skip when DATABASE_URL is unset or unreachable, so `vitest run` stays
 * green without a database (the non-DB suites still run). Run them with
 * DATABASE_URL pointing at a migrated + seeded (disposable) database:
 *   npm run db:setup && npm run test
 *
 * The repository (and its Prisma client) is imported dynamically only when a DB
 * is reachable, so importing this file never constructs a client / requires the
 * DATABASE_URL env on a database-less machine.
 */

let db: PrismaClient | undefined;
let repo: typeof import('../lib/content') | undefined;
let available = false;

if (process.env.DATABASE_URL) {
  db = new PrismaClient();
  try {
    await db.$queryRaw`SELECT 1`;
    available = (await db.article.count()) > 0;
    if (available) repo = await import('../lib/content');
  } catch {
    available = false;
  }
}

const suite = available && db && repo ? describe : describe.skip;

suite('database integration (migrated + seeded DATABASE_URL)', () => {
  afterAll(async () => {
    await db!.$disconnect();
  });

  it('schema relationships: a published article has author, category and ordered blocks', async () => {
    const a = await db!.article.findFirst({
      where: { workflowStatus: WorkflowStatus.PUBLISHED },
      include: { author: true, category: true, blocks: { orderBy: { sortOrder: 'asc' } } },
    });
    expect(a).toBeTruthy();
    expect(a!.author.name).toBeTruthy();
    expect(a!.category.name).toBeTruthy();
    expect(a!.blocks.length).toBeGreaterThan(0);
    const orders = a!.blocks.map((b) => b.sortOrder);
    expect(orders).toEqual([...orders].sort((x, y) => x - y));
  });

  it('published-only repository returns only PUBLISHED content', async () => {
    const pub = await repo!.getPublishedArticles();
    expect(pub.length).toBeGreaterThan(0);
    for (const a of pub) expect(a.workflowStatus).toBe('published');
  });

  it('draft / scheduled / archived rows are excluded from public reads (then cleaned up)', async () => {
    const author = await db!.author.findFirstOrThrow();
    const category = await db!.category.findFirstOrThrow();
    const ids = ['itest-draft', 'itest-scheduled', 'itest-archived'];
    const mk = (suffix: string, status: WorkflowStatus) =>
      db!.article.create({
        data: {
          id: `itest-${suffix}`, slug: `itest-${suffix}`, title: `IT ${suffix}`, excerpt: 'x',
          articleType: 'news', workflowStatus: status, authorId: author.id, categoryId: category.id,
          publishedAt: new Date(),
        },
      });
    try {
      await mk('draft', WorkflowStatus.DRAFT);
      await mk('scheduled', WorkflowStatus.SCHEDULED);
      await mk('archived', WorkflowStatus.ARCHIVED);
      const slugs = await repo!.getPublishedArticleSlugs();
      expect(slugs).not.toContain('itest-draft');
      expect(slugs).not.toContain('itest-scheduled');
      expect(slugs).not.toContain('itest-archived');
      expect(await repo!.getPublishedArticleBySlug('itest-draft')).toBeNull();
      expect(await repo!.getPublishedArticleBySlug('itest-scheduled')).toBeNull();
      expect(await repo!.getPublishedArticleBySlug('itest-archived')).toBeNull();
    } finally {
      await db!.article.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it('slug uniqueness is enforced at the database level', async () => {
    const existing = await db!.article.findFirstOrThrow({ where: { workflowStatus: WorkflowStatus.PUBLISHED } });
    const author = await db!.author.findFirstOrThrow();
    const category = await db!.category.findFirstOrThrow();
    await expect(
      db!.article.create({
        data: { slug: existing.slug, title: 'dup', excerpt: 'x', articleType: 'news', authorId: author.id, categoryId: category.id },
      }),
    ).rejects.toThrow();
  });

  it('category relationship: section query returns only that category', async () => {
    const comp = await repo!.getPublishedArticlesBySection('NFR Competition');
    for (const a of comp) expect(a.category).toBe('NFR Competition');
  });

  it('discipline relationship query returns only published articles', async () => {
    const disc = await db!.discipline.findFirst();
    expect(disc).toBeTruthy();
    const arts = await repo!.getPublishedArticlesByDiscipline(disc!.slug);
    for (const a of arts) expect(a.workflowStatus).toBe('published');
  });

  it('recurring event vs edition distinction is preserved', async () => {
    const ev = await db!.rodeoEvent.findFirst({ include: { editions: true } });
    if (ev) {
      expect(Array.isArray(ev.editions)).toBe(true);
      for (const ed of ev.editions) expect(ed.eventId).toBe(ev.id);
    }
  });

  it('related articles never include the source article', async () => {
    const a = await db!.article.findFirstOrThrow({ where: { workflowStatus: WorkflowStatus.PUBLISHED } });
    const related = await repo!.getRelatedPublishedArticles(a.id, 3);
    expect(related.find((r) => r.id === a.id)).toBeUndefined();
    expect(related.length).toBeLessThanOrEqual(3);
  });

  it('unknown slug returns null (neutral 404 boundary)', async () => {
    expect(await repo!.getPublishedArticleBySlug('definitely-not-a-real-slug-xyz')).toBeNull();
  });

  it('catalog is stable between a raw count and the repository read (seed consistency)', async () => {
    const raw = await db!.article.count({ where: { workflowStatus: WorkflowStatus.PUBLISHED } });
    const viaRepo = (await repo!.getPublishedArticles()).length;
    expect(viaRepo).toBe(raw);
  });

  it('database error surfaces as a rejection rather than bad data', async () => {
    await expect(db!.$queryRawUnsafe('SELECT * FROM nonexistent_table_xyz')).rejects.toThrow();
  });
});
