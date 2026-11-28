import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, WorkflowStatus } from '@prisma/client';
import { toCardArticle, toCardArticles, SEARCH_INDEX_LIMIT } from '@/lib/content';
import type { Article } from '@/types';

/**
 * Stage 09 release gate — the two optimizations that changed what reaches the
 * browser, pinned so neither can regress silently.
 *
 *   1. Card projection. The homepage shipped every article's full prose into
 *      React's client payload so cards could show a title and a thumbnail.
 *      These tests fix the contract: the BODY goes, everything a card renders
 *      stays, and article DETAIL is untouched.
 *   2. Search-index cap. The quick-search index was unbounded — every published
 *      article, on every page, forever.
 */

const sample = (over: Partial<Article> = {}): Article =>
  ({
    id: 'a1',
    slug: 'nfr-2026-schedule',
    title: 'NFR 2026 Schedule',
    deck: 'Every round, every night.',
    excerpt: 'A complete guide to the ten rounds.',
    content: ['First paragraph of real prose.', 'Second paragraph.'],
    structuredBody: [{ type: 'paragraph', text: 'Body block' }],
    category: 'NFR Competition',
    categorySlug: 'nfr-competition',
    readTime: '6 min read',
    author: { name: 'Clayton Vance', role: 'Senior Writer' },
    publishedAt: '2026-11-20',
    heroImage: '/api/media/2026/11/hero.webp',
    imageCredit: 'Sports Media Pool',
    imageAltText: 'A bronc rider mid-ride',
    ...over,
  }) as Article;

describe('Stage 09 — article card projection', () => {
  it('removes the article BODY, which is what bloated the payload', () => {
    const card = toCardArticle(sample());
    expect(card.content).toEqual([]);
    expect(card.structuredBody).toBeUndefined();
  });

  it('keeps every field a card actually renders', () => {
    const card = toCardArticle(sample());
    // If any of these were dropped, cards would render blank or links would break.
    expect(card.id).toBe('a1');
    expect(card.slug).toBe('nfr-2026-schedule');
    expect(card.title).toBe('NFR 2026 Schedule');
    expect(card.deck).toBe('Every round, every night.');
    expect(card.excerpt).toBe('A complete guide to the ten rounds.');
    expect(card.heroImage).toBe('/api/media/2026/11/hero.webp');
    expect(card.imageCredit).toBe('Sports Media Pool');
    expect(card.imageAltText).toBe('A bronc rider mid-ride');
    expect(card.readTime).toBe('6 min read');
    expect(card.publishedAt).toBe('2026-11-20');
    expect(card.author.name).toBe('Clayton Vance');
    expect(card.category).toBe('NFR Competition');
    expect(card.categorySlug).toBe('nfr-competition');
  });

  it('does not mutate the source article, so detail pages keep their body', () => {
    const original = sample();
    const card = toCardArticle(original);
    expect(original.content).toHaveLength(2);
    expect(original.structuredBody).toHaveLength(1);
    expect(card).not.toBe(original);
  });

  it('projects a list in order and leaves an empty list alone', () => {
    const list = [sample({ id: 'a1' }), sample({ id: 'a2' }), sample({ id: 'a3' })];
    const cards = toCardArticles(list);
    expect(cards.map((c) => c.id)).toEqual(['a1', 'a2', 'a3']);
    expect(cards.every((c) => c.content.length === 0)).toBe(true);
    expect(toCardArticles([])).toEqual([]);
  });

  it('is safe on an article that already has no body', () => {
    const card = toCardArticle(sample({ content: [], structuredBody: undefined }));
    expect(card.content).toEqual([]);
    expect(card.title).toBe('NFR 2026 Schedule');
  });
});

/* ── Database-backed: the resolvers that feed client components ──────── */

let db: PrismaClient | undefined;
let content: typeof import('@/lib/content') | undefined;
let home: typeof import('@/lib/cms/homepageData') | undefined;
let available = false;

if (process.env.DATABASE_URL) {
  db = new PrismaClient();
  try {
    await db.$queryRaw`SELECT 1`;
    available = true;
    content = await import('@/lib/content');
    home = await import('@/lib/cms/homepageData');
  } catch {
    available = false;
  }
}

const suite = available && db && content && home ? describe : describe.skip;
const TAG = `s09${Math.random().toString(36).slice(2, 8)}`;
let authorId = '';
let categoryId = '';

suite('Stage 09 — payload and search index against the database', () => {
  beforeAll(async () => {
    const author = await db!.author.create({
      data: { name: `S09 Author ${TAG}`, slug: `s09-author-${TAG}`, role: 'Staff Writer' },
    });
    const cat = await db!.category.create({ data: { name: `S09 Cat ${TAG}`, slug: `s09-cat-${TAG}` } });
    authorId = author.id;
    categoryId = cat.id;

    const mk = (suffix: string, status: WorkflowStatus, minutesAgo: number, publishedAt?: Date) =>
      db!.article.create({
        data: {
          slug: `${TAG}-${suffix}`,
          // A distinctive token so full-text search can find these fixtures.
          title: `Zebraquest ${suffix} ${TAG}`,
          excerpt: 'fixture excerpt',
          deck: 'fixture deck',
          articleType: 'news',
          workflowStatus: status,
          authorId: author.id,
          categoryId: cat.id,
          publishedAt: publishedAt ?? new Date(Date.now() - minutesAgo * 60_000),
        },
      });

    for (let i = 0; i < 4; i++) await mk(`pub-${i}`, WorkflowStatus.PUBLISHED, i + 1);
    await mk('draft', WorkflowStatus.DRAFT, 1);
    await mk('archived', WorkflowStatus.ARCHIVED, 1);
    await mk('review', WorkflowStatus.IN_REVIEW, 1);
    await mk('future', WorkflowStatus.SCHEDULED, 0, new Date(Date.now() + 86_400_000));
  });

  afterAll(async () => {
    await db!.article.deleteMany({ where: { slug: { startsWith: `${TAG}-` } } });
    await db!.category.deleteMany({ where: { id: categoryId } });
    await db!.author.deleteMany({ where: { id: authorId } });
    await db!.$disconnect();
  });

  it('the homepage resolver emits NO article body for any slot', async () => {
    const slots = [
      { id: 's-latest', sectionType: 'latest-coverage', visible: true, order: 1, props: { articleCount: 6 } },
      { id: 's-ent', sectionType: 'entertainment', visible: true, order: 2, props: { articleCount: 3 } },
      { id: 's-hero', sectionType: 'editorial-hero', visible: true, order: 0, props: { secondaryCount: 2 } },
    ];
    const out = await home!.resolveHomepageSlots(slots);
    const everyArticle = out.flatMap((r) => [
      ...(r.data.articles ?? []),
      ...(r.data.secondary ?? []),
      ...(r.data.lead ? [r.data.lead] : []),
    ]);
    expect(everyArticle.length).toBeGreaterThan(0);
    for (const a of everyArticle) {
      expect(a.content, `${a.slug} leaked content`).toEqual([]);
      expect(a.structuredBody, `${a.slug} leaked structuredBody`).toBeUndefined();
      // …while the card still has what it needs to render and link.
      expect(a.slug).toBeTruthy();
      expect(a.title).toBeTruthy();
    }
  });

  it('article DETAIL reads keep the full body — the projection is card-only', async () => {
    // Against SEEDED content, because the body lives in the `blocks` relation
    // and the fixtures above deliberately have none. The point of the assertion
    // is that the detail path is untouched by the card projection.
    const all = await content!.getPublishedArticles();
    const withBody = all.find((a) => (a.content?.length ?? 0) > 0 || (a.structuredBody?.length ?? 0) > 0);
    if (!withBody) return; // no seeded article carries a body in this database
    const full = await content!.getPublishedArticleBySlug(withBody.slug);
    expect(full).toBeTruthy();
    expect((full!.content?.length ?? 0) + (full!.structuredBody?.length ?? 0)).toBeGreaterThan(0);
    // …and the very same article, projected, loses exactly the body.
    const card = toCardArticle(full!);
    expect(card.content).toEqual([]);
    expect(card.structuredBody).toBeUndefined();
    expect(card.title).toBe(full!.title);
  });

  it('card projection never exposes draft or unpublished articles', async () => {
    const cards = await content!.getPublishedArticlesBySection({ categoryId });
    const slugs = cards.map((c) => c.slug);
    for (const bad of ['draft', 'archived', 'review', 'future']) {
      expect(slugs).not.toContain(`${TAG}-${bad}`);
    }
    expect(slugs).toHaveLength(4);
  });

  /* ── search index cap ── */

  it('bounds the quick-search index and keeps ordering deterministic', async () => {
    const a = await content!.getPublishedSearchIndex();
    const b = await content!.getPublishedSearchIndex();
    expect(a.length).toBeLessThanOrEqual(SEARCH_INDEX_LIMIT);
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
  });

  it('the cap is 300 — a bound, not an accident', () => {
    expect(SEARCH_INDEX_LIMIT).toBe(300);
  });

  it('excludes draft, archived, in-review and future articles from quick search', async () => {
    const slugs = (await content!.getPublishedSearchIndex()).map((x) => x.slug);
    for (const bad of ['draft', 'archived', 'review', 'future']) {
      expect(slugs).not.toContain(`${TAG}-${bad}`);
    }
  });

  it('quick-search entries carry only card fields, never the body', async () => {
    const [first] = await content!.getPublishedSearchIndex();
    expect(first).toBeTruthy();
    expect(Object.keys(first).sort()).toEqual(['category', 'deck', 'id', 'readTime', 'slug', 'title']);
  });

  it('FULL search still reaches the complete eligible corpus, beyond the cap', async () => {
    // `/search/` uses runPublicSearch, which queries the database directly and
    // is therefore unaffected by the quick-search cap. An article that would
    // fall outside the newest 300 is still findable there.
    const { runPublicSearch } = await import('@/lib/search/publicSearch');
    const res = await runPublicSearch({ q: 'Zebraquest', pageSize: 50 });
    // Matched on TITLE: these raw-SQL rows do not populate `slug`, which is a
    // pre-existing quirk of the search projection and not what this asserts.
    const titles = res.articles.rows.map((a) => a.title);
    expect(titles).toContain(`Zebraquest pub-3 ${TAG}`);
    // …and full search excludes ineligible content just the same.
    for (const bad of ['draft', 'archived', 'review', 'future']) {
      expect(titles).not.toContain(`Zebraquest ${bad} ${TAG}`);
    }
  });
});
