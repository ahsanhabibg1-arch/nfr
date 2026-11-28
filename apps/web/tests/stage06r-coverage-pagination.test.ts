import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, WorkflowStatus } from '@prisma/client';

/**
 * Stage 06-R FC-02A — the `/coverage/` archive across MULTIPLE pages.
 *
 * The previous UAT had 11 articles and one page, so pagination was never
 * exercised. These fixtures create enough eligible articles for at least three
 * pages at the configured size, and then assert the property that actually
 * matters: walking every page returns each article exactly once, with nothing
 * skipped and nothing repeated.
 *
 * Deterministic ordering is the reason that holds. `listCoverageArticles`
 * orders by `(publishedAt, id)`; without the `id` tie-break, two articles
 * published in the same second could swap places between two queries and one
 * would be served on both pages while another was served on neither.
 */

let db: PrismaClient | undefined;
let content: typeof import('../lib/content') | undefined;
let available = false;

if (process.env.DATABASE_URL) {
  db = new PrismaClient();
  try {
    await db.$queryRaw`SELECT 1`;
    available = true;
    content = await import('../lib/content');
  } catch {
    available = false;
  }
}

const suite = available && db && content ? describe : describe.skip;

const TAG = `cov${Math.random().toString(36).slice(2, 8)}`;
const PAGE_SIZE = 6;
const ELIGIBLE = 20; // > 3 pages at size 6
const TITLE_MARK = 'Zebra'; // searchable token planted in a known subset

let authorId = '';
let catA = '';
let catB = '';

suite('Stage 06-R FC-02A — coverage archive pagination', () => {
  beforeAll(async () => {
    const author = await db!.author.create({
      data: { name: `Cov Author ${TAG}`, slug: `cov-author-${TAG}`, role: 'Staff Writer' },
    });
    const a = await db!.category.create({ data: { name: `Cov A ${TAG}`, slug: `cov-a-${TAG}` } });
    const b = await db!.category.create({ data: { name: `Cov B ${TAG}`, slug: `cov-b-${TAG}` } });
    authorId = author.id;
    catA = a.id;
    catB = b.id;

    const base = Date.parse('2026-01-01T00:00:00Z');
    for (let i = 0; i < ELIGIBLE; i++) {
      await db!.article.create({
        data: {
          slug: `${TAG}-a${String(i).padStart(2, '0')}`,
          // Every 4th article carries the search token.
          title: `${i % 4 === 0 ? TITLE_MARK : 'Plain'} coverage ${TAG} ${String(i).padStart(2, '0')}`,
          excerpt: 'fixture excerpt',
          articleType: 'news',
          workflowStatus: WorkflowStatus.PUBLISHED,
          authorId: author.id,
          categoryId: i % 2 === 0 ? a.id : b.id,
          // Deliberately IDENTICAL timestamps for two of them, to exercise the
          // `id` tie-break rather than assume distinct publish times.
          publishedAt: new Date(base + (i === 5 ? 4 : i) * 60_000),
        },
      });
    }
    // Ineligible rows, one of each kind — none may ever appear.
    for (const [suffix, status] of [
      ['draft', WorkflowStatus.DRAFT],
      ['review', WorkflowStatus.IN_REVIEW],
      ['archived', WorkflowStatus.ARCHIVED],
    ] as const) {
      await db!.article.create({
        data: {
          slug: `${TAG}-x-${suffix}`,
          title: `${TITLE_MARK} hidden ${suffix} ${TAG}`,
          excerpt: 'x',
          articleType: 'news',
          workflowStatus: status,
          authorId: author.id,
          categoryId: a.id,
          publishedAt: new Date(base),
        },
      });
    }
    await db!.article.create({
      data: {
        slug: `${TAG}-x-future`,
        title: `${TITLE_MARK} hidden future ${TAG}`,
        excerpt: 'x',
        articleType: 'news',
        workflowStatus: WorkflowStatus.SCHEDULED,
        authorId: author.id,
        categoryId: a.id,
        publishedAt: new Date(Date.now() + 86_400_000),
      },
    });
  });

  afterAll(async () => {
    await db!.article.deleteMany({ where: { slug: { startsWith: `${TAG}-` } } });
    await db!.category.deleteMany({ where: { id: { in: [catA, catB] } } });
    await db!.author.deleteMany({ where: { id: authorId } });
    await db!.$disconnect();
  });

  /** Every fixture article, in page order, by walking the archive. */
  async function walkAll(query: Record<string, unknown> = {}): Promise<string[]> {
    const first = await content!.listCoverageArticles({ pageSize: PAGE_SIZE, page: 1, ...query });
    const slugs: string[] = [];
    for (let p = 1; p <= first.totalPages; p++) {
      const page = await content!.listCoverageArticles({ pageSize: PAGE_SIZE, page: p, ...query });
      slugs.push(...page.articles.filter((a) => a.slug.startsWith(`${TAG}-`)).map((a) => a.slug));
    }
    return slugs;
  }

  it('produces at least three pages at the configured size', async () => {
    const r = await content!.listCoverageArticles({ pageSize: PAGE_SIZE, page: 1 });
    expect(r.pageSize).toBe(PAGE_SIZE);
    expect(r.totalPages).toBeGreaterThanOrEqual(3);
    expect(r.articles.length).toBe(PAGE_SIZE);
  });

  it('first, middle and last pages each return results', async () => {
    const first = await content!.listCoverageArticles({ pageSize: PAGE_SIZE, page: 1 });
    const mid = await content!.listCoverageArticles({ pageSize: PAGE_SIZE, page: 2 });
    const last = await content!.listCoverageArticles({ pageSize: PAGE_SIZE, page: first.totalPages });
    for (const p of [first, mid, last]) expect(p.articles.length).toBeGreaterThan(0);
    expect(last.page).toBe(first.totalPages);
    // No overlap between adjacent pages.
    const ids = (p: typeof first) => p.articles.map((a) => a.id);
    expect(ids(first).filter((id) => ids(mid).includes(id))).toEqual([]);
  });

  it('walking every page yields each article exactly once — none skipped, none repeated', async () => {
    const seen = await walkAll();
    expect(seen).toHaveLength(ELIGIBLE);
    expect(new Set(seen).size).toBe(ELIGIBLE);
  });

  it('ordering is deterministic across repeated queries, even for equal timestamps', async () => {
    const a = await walkAll();
    const b = await walkAll();
    expect(a).toEqual(b);
  });

  it('newest-first is the default, and oldest reverses it', async () => {
    const newest = await walkAll({ sort: 'newest' });
    const oldest = await walkAll({ sort: 'oldest' });
    expect(oldest).toEqual([...newest].reverse());
  });

  it('search works WITH pagination and never leaks ineligible articles', async () => {
    const found = await walkAll({ q: TITLE_MARK });
    expect(found.length).toBe(ELIGIBLE / 4);
    expect(new Set(found).size).toBe(found.length);
    for (const bad of ['x-draft', 'x-review', 'x-archived', 'x-future']) {
      expect(found).not.toContain(`${TAG}-${bad}`);
    }
  });

  it('category filtering works WITH pagination and partitions the set', async () => {
    const a = await walkAll({ categorySlug: `cov-a-${TAG}` });
    const b = await walkAll({ categorySlug: `cov-b-${TAG}` });
    expect(a.length + b.length).toBe(ELIGIBLE);
    expect(a.filter((s) => b.includes(s))).toEqual([]);
  });

  it('sorting works WITH pagination and filtering combined', async () => {
    const combined = await walkAll({ categorySlug: `cov-a-${TAG}`, sort: 'title' });
    expect(combined.length).toBe(ELIGIBLE / 2);
    expect(new Set(combined).size).toBe(combined.length);
  });

  it('an empty search result is empty, not a full feed', async () => {
    const r = await content!.listCoverageArticles({ q: `no-such-text-${TAG}`, pageSize: PAGE_SIZE });
    expect(r.articles).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.totalPages).toBe(1);
  });

  it('out-of-range and invalid page numbers clamp instead of erroring', async () => {
    const high = await content!.listCoverageArticles({ page: 99999, pageSize: PAGE_SIZE });
    expect(high.page).toBe(high.totalPages);
    expect(high.articles.length).toBeGreaterThan(0);

    for (const page of [0, -5, Number.NaN]) {
      const r = await content!.listCoverageArticles({ page, pageSize: PAGE_SIZE });
      expect(r.page).toBe(1);
    }
  });

  it('page size is bounded, so a stored value cannot issue an unbounded query', async () => {
    expect((await content!.listCoverageArticles({ pageSize: 9999 })).pageSize).toBe(48);
    expect((await content!.listCoverageArticles({ pageSize: 1 })).pageSize).toBe(6);
  });

  it('reports the applied filters back, so the view can echo them', async () => {
    const r = await content!.listCoverageArticles({
      q: `  ${TITLE_MARK}  `,
      categorySlug: `cov-a-${TAG}`,
      sort: 'title',
      pageSize: PAGE_SIZE,
    });
    expect(r.applied).toEqual({ q: TITLE_MARK, categorySlug: `cov-a-${TAG}`, sort: 'title' });
  });

  it('an unrecognised sort degrades to newest rather than ordering arbitrarily', async () => {
    const bogus = await content!.listCoverageArticles({
      sort: 'bogus' as never,
      pageSize: PAGE_SIZE,
    });
    expect(bogus.applied.sort).toBe('newest');
  });

  it('lists only categories that have eligible articles', async () => {
    const cats = await content!.listCoverageCategories();
    const slugs = cats.map((c) => c.slug);
    expect(slugs).toContain(`cov-a-${TAG}`);
    expect(slugs).toContain(`cov-b-${TAG}`);
    expect(cats.find((c) => c.slug === `cov-a-${TAG}`)!.count).toBe(ELIGIBLE / 2);
  });
});
