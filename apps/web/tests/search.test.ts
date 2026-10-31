import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type * as ArticleSvc from '../lib/cms/articleService';
import type * as SearchSvc from '../lib/search/publicSearch';

/**
 * Batch 07 — public internal-search integration (§20 items 1–10). Exercises the REAL
 * PostgreSQL FTS engine against the test DB: relevance/ranking, published-only
 * visibility, filtering, pagination, special-character/Unicode/long queries, SQL
 * injection resistance, and zero-result handling. Self-skips without DATABASE_URL.
 * All rows use a coined token so matches are isolated from other seeded content.
 */
let available = false;
let prisma: PrismaClient;
let article: typeof ArticleSvc;
let search: typeof SearchSvc;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    available = true;
    article = await import('../lib/cms/articleService');
    search = await import('../lib/search/publicSearch');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
  } catch {
    available = false;
  }
}
const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);
const TOKEN = 'zylophonium'; // coined: isolates these rows in FTS

suite('Batch 07 — public internal search', () => {
  const ids: Record<string, string> = {};
  let userId = '';
  let catSlug = '';
  let otherCatSlug = '';
  let discSlug = '';

  function input(over: Partial<ArticleSvc.ArticleInput> = {}): ArticleSvc.ArticleInput {
    return {
      slug: `b7test-${rid()}`,
      title: 'A Standard Dispatch Headline',
      excerpt: 'A valid editorial excerpt long enough to satisfy the publication gate checks for this search test case.',
      blocks: [{ type: 'paragraph', text: 'Opening paragraph with enough words to exceed the minimum body length guidance threshold for the analyzer.' }],
      categoryName: 'NFR Competition',
      authorName: 'Search Tester',
      imageRightsStatus: 'Staff Photo',
      imageAltText: 'Descriptive alt text for the featured test photograph.',
      seoTitle: 'A Reasonable SEO Title For Testing Search',
      metaDescription: 'A reasonable meta description within the configured guidance length range for the search test case.',
      ...over,
    } as ArticleSvc.ArticleInput;
  }
  const publish = (id: string) => prisma.article.update({ where: { id }, data: { workflowStatus: 'PUBLISHED', publishedAt: new Date() } });

  beforeAll(async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'author' as RoleKey } });
    const u = await prisma.user.create({ data: { email: `b7search-${rid()}@example.com`, name: 'B7 Search', status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    userId = u.id;
    const actor = { id: u.id, roles: ['author'] as RoleKey[] } as ArticleSvc.ActorContext;

    // A: token in TITLE (weight A). B: token only in EXCERPT (weight B). C: DRAFT (hidden).
    const a = await article.saveArticle(actor, input({ title: `${TOKEN} championship analysis` }));
    ids.a = a.id;
    await publish(a.id);
    const b = await article.saveArticle(actor, input({ excerpt: `An excerpt mentioning ${TOKEN} once, long enough to satisfy the gate checks for this test.` }));
    ids.b = b.id;
    await publish(b.id);
    const c = await article.saveArticle(actor, input({ title: `${TOKEN} draft never published` }));
    ids.c = c.id; // left as DRAFT

    const cat = await prisma.article.findUniqueOrThrow({ where: { id: a.id }, select: { category: { select: { slug: true } } } });
    catSlug = cat.category.slug;
    const other = await prisma.category.findFirst({ where: { slug: { not: catSlug } }, select: { slug: true } });
    otherCatSlug = other?.slug ?? '';
    const disc = await prisma.discipline.findFirst({ select: { id: true, slug: true } });
    if (disc) {
      discSlug = disc.slug;
      await prisma.articleDiscipline.create({ data: { articleId: a.id, disciplineId: disc.id } }).catch(() => {});
    }
  });

  afterAll(async () => {
    if (!available) return;
    for (const id of Object.values(ids)) await prisma.article.delete({ where: { id } }).catch(() => {});
    await prisma.userRole.deleteMany({ where: { userId } }).catch(() => {});
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it('returns real DB matches and excludes unpublished content', async () => {
    const r = await search.runPublicSearch({ q: TOKEN, type: 'article' });
    const foundIds = r.articles.rows.map((x) => x.id);
    expect(foundIds).toContain(ids.a);
    expect(foundIds).toContain(ids.b);
    expect(foundIds).not.toContain(ids.c); // draft never leaks
  });

  it('ranks a title match above an excerpt-only match (weighted relevance)', async () => {
    const r = await search.runPublicSearch({ q: TOKEN, type: 'article', sort: 'relevance' });
    const posA = r.articles.rows.findIndex((x) => x.id === ids.a);
    const posB = r.articles.rows.findIndex((x) => x.id === ids.b);
    expect(posA).toBeGreaterThanOrEqual(0);
    expect(posB).toBeGreaterThan(posA);
  });

  it('paginates deterministically', async () => {
    const p1 = await search.runPublicSearch({ q: TOKEN, type: 'article', pageSize: 1, page: 1 });
    const p2 = await search.runPublicSearch({ q: TOKEN, type: 'article', pageSize: 1, page: 2 });
    expect(p1.articles.total).toBe(2);
    expect(p1.articles.totalPages).toBe(2);
    expect(p1.articles.rows).toHaveLength(1);
    expect(p1.articles.rows[0].id).not.toBe(p2.articles.rows[0]?.id);
  });

  it('filters by category', async () => {
    const inCat = await search.runPublicSearch({ q: TOKEN, type: 'article', category: catSlug });
    expect(inCat.articles.rows.map((x) => x.id).sort()).toEqual([ids.a, ids.b].sort());
    if (otherCatSlug) {
      const inOther = await search.runPublicSearch({ q: TOKEN, type: 'article', category: otherCatSlug });
      expect(inOther.articles.total).toBe(0);
    }
  });

  it('filters by discipline', async () => {
    if (!discSlug) return;
    const r = await search.runPublicSearch({ q: TOKEN, type: 'article', discipline: discSlug });
    expect(r.articles.rows.map((x) => x.id)).toEqual([ids.a]);
  });

  it('handles special characters without error (websearch operators)', async () => {
    // Punctuation around a term is tolerated; websearch_to_tsquery AND-combines
    // `zylophonium` and `championship`, both present in article A's title.
    const r = await search.runPublicSearch({ q: `${TOKEN}!!!  championship, analysis.`, type: 'article' });
    expect(r.articles.rows.map((x) => x.id)).toContain(ids.a);
    // A stray operator-only / dangerous string must not throw.
    const r2 = await search.runPublicSearch({ q: `"unterminated & | ! ( )`, type: 'article' });
    expect(Array.isArray(r2.articles.rows)).toBe(true);
  });

  it('handles Unicode queries without error', async () => {
    const r = await search.runPublicSearch({ q: 'rodéo café ñandú', type: 'article' });
    expect(Array.isArray(r.articles.rows)).toBe(true);
  });

  it('bounds excessively long queries without error', async () => {
    const r = await search.runPublicSearch({ q: `${TOKEN} `.repeat(60), type: 'article' });
    expect(r.normalizedQuery.length).toBeLessThanOrEqual(160);
    expect(Array.isArray(r.articles.rows)).toBe(true); // handled, no crash
  });

  it('is resistant to SQL injection (parameterized)', async () => {
    const before = await prisma.article.count();
    const r = await search.runPublicSearch({ q: `'; DROP TABLE "Article"; --`, type: 'article' });
    const after = await prisma.article.count();
    expect(after).toBe(before); // table intact
    expect(r.zeroResult === true || r.articles.total >= 0).toBe(true);
  });

  it('reports a zero-result query honestly', async () => {
    const r = await search.runPublicSearch({ q: 'zzqnoresultqzz', type: 'article' });
    expect(r.totalResults).toBe(0);
    expect(r.zeroResult).toBe(true);
    expect(r.emptyQuery).toBe(false);
  });

  it('treats an empty query as the browse state (not a zero result)', async () => {
    const r = await search.runPublicSearch({ q: '   ' });
    expect(r.emptyQuery).toBe(true);
    expect(r.zeroResult).toBe(false);
  });
});
