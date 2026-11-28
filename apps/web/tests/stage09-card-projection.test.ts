import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, WorkflowStatus } from '@prisma/client';
import {
  toCardArticle,
  toCardArticles,
  toCardArticleWithLead,
  buildCardLead,
  CARD_LEAD_MAX_CHARS,
  SEARCH_INDEX_LIMIT,
} from '@/lib/content';
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

  /* ── the opt-in bounded lead ─────────────────────────────────────────── */

  it('buildCardLead keeps a short body whole', () => {
    expect(buildCardLead(['One sentence.', 'And a second.'])).toBe('One sentence. And a second.');
  });

  it('buildCardLead joins paragraphs, so a short opening one does not strand the bound', () => {
    // Two-line paragraphs are common; stopping at the first would often return
    // far less than the card has room for, which is the whole reason the
    // paragraphs are joined before the bound is applied.
    const words = (n: number, w: string) => Array.from({ length: n }, () => w).join(' ');
    const lead = buildCardLead(['Short.', words(40, 'second'), words(40, 'third')], 300);
    expect(lead.length).toBeGreaterThan(280);
    expect(lead).toContain('Short.');
    expect(lead).toContain('second');
    // Reached past the second paragraph into the third, which a first-paragraph
    // -only implementation could never do.
    expect(lead).toContain('third');
  });

  it('buildCardLead cuts on a WORD boundary and marks the continuation', () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    const lead = buildCardLead(words.split(' ').map((w) => w), 100);
    expect(lead.length).toBeLessThanOrEqual(101);
    expect(lead.endsWith('…')).toBe(true);
    // Never mid-word: the character before the ellipsis is the end of a word.
    expect(lead).not.toMatch(/\s…$/);
    expect(lead.slice(0, -1).split(' ').pop()).toMatch(/^word\d+$/);
  });

  it('buildCardLead normalises whitespace and survives an empty or ragged body', () => {
    expect(buildCardLead([])).toBe('');
    expect(buildCardLead(['   ', ''])).toBe('');
    expect(buildCardLead(['  spaced   out  ', '', ' text '])).toBe('spaced out text');
  });

  it('buildCardLead falls back to a hard cut on a single pathological word', () => {
    const lead = buildCardLead(['x'.repeat(500)], 100);
    expect(lead.length).toBeLessThanOrEqual(101);
    expect(lead.endsWith('…')).toBe(true);
  });

  it('toCardArticleWithLead keeps ONE bounded paragraph and still drops structuredBody', () => {
    const source: Article = { ...sample(), content: ['First paragraph. '.repeat(40), 'Second paragraph.'] };
    const card = toCardArticleWithLead(source);
    expect(card.content.length).toBe(1);
    expect(card.content[0].length).toBeLessThanOrEqual(CARD_LEAD_MAX_CHARS + 1);
    expect(card.structuredBody).toBeUndefined();
    // The source is untouched, exactly as for the plain projection.
    expect(source.content.length).toBe(2);
  });

  it('toCardArticleWithLead is a no-op on an article that has no body', () => {
    const card = toCardArticleWithLead({ ...sample(), content: [] });
    expect(card.content).toEqual([]);
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

  /**
   * The contract narrowed, and got more precise rather than weaker.
   *
   * It used to be "no slot emits any body". One slot now needs running text:
   * `latest-coverage`'s featured card is stretched to the height of the card
   * column beside it, and `deck` + `excerpt` run several lines short of that,
   * leaving a blank band no clamp can close.
   *
   * So the assertion is no longer "none" but "none, except one slot, and there
   * only within a stated bound" — which is the property that actually protected
   * the payload. The 165 KB this projection was introduced to remove was
   * UNBOUNDED body: sixteen complete articles. A single paragraph capped at
   * `CARD_LEAD_MAX_CHARS` is what keeps that from coming back, so the cap is
   * what gets pinned, per article and across the whole payload.
   */
  it('the homepage resolver emits NO article body, except one bounded lead slot', async () => {
    const slots = [
      { id: 's-latest', sectionType: 'latest-coverage', visible: true, order: 1, props: { articleCount: 6 } },
      { id: 's-ent', sectionType: 'entertainment', visible: true, order: 2, props: { articleCount: 3 } },
      { id: 's-hero', sectionType: 'editorial-hero', visible: true, order: 0, props: { secondaryCount: 2 } },
    ];
    const out = await home!.resolveHomepageSlots(slots);

    let leadBearing = 0;
    let everyArticleSeen = 0;

    for (const row of out) {
      const articles = [
        ...(row.data.articles ?? []),
        ...(row.data.secondary ?? []),
        ...(row.data.lead ? [row.data.lead] : []),
      ];
      const mayCarryLead = row.slot.sectionType === 'latest-coverage';

      for (const a of articles) {
        everyArticleSeen++;

        // `structuredBody` is stripped EVERYWHERE, with no exception. It is the
        // larger of the two fields and nothing on a card reads it.
        expect(a.structuredBody, `${a.slug} leaked structuredBody`).toBeUndefined();

        if (!mayCarryLead) {
          expect(a.content, `${a.slug} leaked content from ${row.slot.sectionType}`).toEqual([]);
        } else {
          // At most ONE paragraph, and no longer than the declared bound.
          expect(a.content.length, `${a.slug} emitted more than one lead paragraph`).toBeLessThanOrEqual(1);
          for (const paragraph of a.content) {
            expect(
              paragraph.length,
              `${a.slug} lead is ${paragraph.length} chars, over the ${CARD_LEAD_MAX_CHARS} bound`,
            ).toBeLessThanOrEqual(CARD_LEAD_MAX_CHARS + 1); // +1 for the ellipsis
          }
          if (a.content.length) leadBearing++;
        }

        // …while the card still has what it needs to render and link.
        expect(a.slug).toBeTruthy();
        expect(a.title).toBeTruthy();
      }
    }

    expect(everyArticleSeen).toBeGreaterThan(0);
    // The seeded corpus has bodies, so the exception must actually be exercised
    // — otherwise this test would still pass if the lead silently stopped being
    // attached, and the blank band would come back unnoticed.
    expect(leadBearing, 'no latest-coverage article carried a lead').toBeGreaterThan(0);
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
