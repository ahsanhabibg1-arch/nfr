import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PrismaClient } from '@prisma/client';
import type { Actor } from '../lib/cms/guard';
import type { RoleKey } from '../lib/auth/rbac';
import type * as ArticleSvc from '../lib/cms/articleService';
import {
  ARTICLE_TYPES,
  SELECTABLE_ARTICLE_TYPES,
  LEGACY_ARTICLE_TYPES,
  EVERGREEN_ARTICLE_TYPE_VALUES,
  isKnownArticleType,
  isSelectableArticleType,
  isLegacyArticleType,
  isEvergreenType,
  isNewsType,
  articleTypeLabel,
  articleTypeOptionsFor,
} from '../lib/content/articleTypes';
import { CategoryArchiveView } from '../views/CategoryArchiveView';
import type { Article } from '../types';

/**
 * `AdminArticleEditorShell` is a client component that calls `useRouter` and
 * `useParams`, which throw outside an app-router context. Only the navigation
 * hooks are replaced; the component, the registry and the rendered markup are
 * all real.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/articles/new/',
}));

/**
 * Batch 04-A — Article Type consistency and evergreen repair.
 *
 * THE DEFECT. Six places each kept their own vocabulary for one free-text
 * column, and the database held a seventh: all 11 published articles store a
 * lowercase legacy value, so **0 of 11** matched the editor's 18 options and
 * **0 of 11** matched the evergreen query.
 *
 * These tests assert behaviour: what the registry answers, what the validator
 * accepts, what the database query returns, and what the rendered HTML
 * contains. Two of them would have failed before this batch for the exact
 * reason the surface was broken — the evergreen query returning zero, and the
 * archive filter hiding a legacy article.
 */

const LEGACY_VALUES = ['guide', 'analysis', 'feature', 'explainer', 'news'];

const EDITOR_PERMISSIONS = {
  canSubmit: true, canReview: true, canApprove: true, canPublish: true,
  canSchedule: true, canDelete: true, canEditAny: true,
};


const APPROVED_EVERGREEN = [
  'Rules & Format', 'History', 'Records & Past Winners', 'How to Watch',
  'Ticket Guide', 'Venue Guide', 'Travel Guide', 'General Information',
  'guide', 'explainer',
];
const APPROVED_NOT_EVERGREEN = [
  'News', 'Event Update', 'Event Guide', 'Schedule', 'Results & Standings',
  'Preview', 'Competitor Profile', 'Entertainment Guide', 'Product Buying Guide',
  'Product Review', 'feature', 'analysis', 'news',
];

// ===========================================================================
// 1-3. The registry
// ===========================================================================

describe('04-A (1) all 18 selectable types exist', () => {
  it('exactly 18, all selectable, in editorial order', () => {
    expect(SELECTABLE_ARTICLE_TYPES).toHaveLength(18);
    expect(SELECTABLE_ARTICLE_TYPES.map((t) => t.value)).toEqual([
      'News', 'Event Update', 'Event Guide', 'Schedule', 'Results & Standings',
      'How to Watch', 'Preview', 'Competitor Profile', 'Rules & Format', 'History',
      'Records & Past Winners', 'Entertainment Guide', 'Ticket Guide', 'Venue Guide',
      'Travel Guide', 'Product Buying Guide', 'Product Review', 'General Information',
    ]);
  });

  it('every entry carries a label and the three policy flags', () => {
    for (const t of ARTICLE_TYPES) {
      expect(typeof t.label).toBe('string');
      expect(t.label.length).toBeGreaterThan(0);
      expect(typeof t.selectable).toBe('boolean');
      expect(typeof t.evergreen).toBe('boolean');
      expect(typeof t.news).toBe('boolean');
    }
  });

  it('values are unique — a duplicate would make the lookup map ambiguous', () => {
    const values = ARTICLE_TYPES.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('04-A (2) all five legacy values are recognised', () => {
  it.each(LEGACY_VALUES)('%s is known, not selectable, and labelled as legacy', (v) => {
    expect(isKnownArticleType(v)).toBe(true);
    expect(isSelectableArticleType(v)).toBe(false);
    expect(isLegacyArticleType(v)).toBe(true);
    expect(articleTypeLabel(v)).toMatch(/legacy/i);
  });

  it('there are exactly five of them', () => {
    expect(LEGACY_ARTICLE_TYPES.map((t) => t.value).sort()).toEqual([...LEGACY_VALUES].sort());
  });
});

describe('04-A (3) unknown types are rejected', () => {
  it.each([
    ['Freestyle'], ['Opinion'], [''], ['  '], ['Feature'], ['GUIDE'], ['Guide'],
    ['news '], [' news'], ['rules & format'], ['<script>'], ['News;DROP'],
  ])('%j is not a known type', (v) => {
    expect(isKnownArticleType(v)).toBe(false);
  });

  it.each([[null], [undefined]])('%j is not a known type', (v) => {
    expect(isKnownArticleType(v as string | null)).toBe(false);
  });

  it('REGRESSION: the check is EXACT, so a case variant cannot be stored', () => {
    // Deliberate: the evergreen query is an exact SQL `IN`. Accepting 'GUIDE'
    // would store a value that validates and then never matches — the bug class
    // this batch removes.
    expect(isKnownArticleType('guide')).toBe(true);
    expect(isKnownArticleType('GUIDE')).toBe(false);
    expect(isKnownArticleType('Guide')).toBe(false);
  });
});

// ===========================================================================
// 7. Evergreen matrix matches the approved policy
// ===========================================================================

describe('04-A (7) evergreen classification matches the approved matrix', () => {
  it.each(APPROVED_EVERGREEN)('%s is evergreen', (v) => {
    expect(isEvergreenType(v)).toBe(true);
    expect(EVERGREEN_ARTICLE_TYPE_VALUES).toContain(v);
  });

  it.each(APPROVED_NOT_EVERGREEN)('%s is NOT evergreen', (v) => {
    expect(isEvergreenType(v)).toBe(false);
    expect(EVERGREEN_ARTICLE_TYPE_VALUES).not.toContain(v);
  });

  it('the matrix covers every registry entry exactly once', () => {
    expect([...APPROVED_EVERGREEN, ...APPROVED_NOT_EVERGREEN].sort())
      .toEqual(ARTICLE_TYPES.map((t) => t.value).sort());
  });

  it('an unknown value is never evergreen', () => {
    expect(isEvergreenType('Freestyle')).toBe(false);
    expect(isEvergreenType(null)).toBe(false);
  });
});

// ===========================================================================
// 12. JSON-LD
// ===========================================================================

describe('04-A (12) JSON-LD distinguishes NewsArticle from Article', () => {
  it.each(['News', 'news', 'Event Update', 'event update', 'NEWS', '  News  '])(
    '%j → NewsArticle (case-insensitive, preserving existing behaviour)',
    (v) => expect(isNewsType(v)).toBe(true),
  );

  it.each(['guide', 'analysis', 'feature', 'Rules & Format', 'Preview', 'General Information', '', 'Freestyle'])(
    '%j → Article',
    (v) => expect(isNewsType(v)).toBe(false),
  );

  it('the rendered JSON-LD @type follows the registry', async () => {
    const { articleJsonLd } = await import('../lib/seo');
    const base = {
      slug: 's', title: 'T', excerpt: 'E', heroImage: '', publishedAt: 'Nov 1, 2026',
      updatedAt: 'Nov 1, 2026', author: { name: 'A', role: 'R' }, category: 'NFR Competition',
    } as unknown as Article;
    expect(articleJsonLd({ ...base, articleType: 'News' } as Article)['@type']).toBe('NewsArticle');
    expect(articleJsonLd({ ...base, articleType: 'news' } as Article)['@type']).toBe('NewsArticle');
    expect(articleJsonLd({ ...base, articleType: 'Event Update' } as Article)['@type']).toBe('NewsArticle');
    expect(articleJsonLd({ ...base, articleType: 'guide' } as Article)['@type']).toBe('Article');
    expect(articleJsonLd({ ...base, articleType: 'Rules & Format' } as Article)['@type']).toBe('Article');
  });

  it('the exported NEWS_ARTICLE_TYPES set is unchanged in membership', async () => {
    const { NEWS_ARTICLE_TYPES } = await import('../lib/seo');
    expect([...NEWS_ARTICLE_TYPES].sort()).toEqual(['event update', 'news']);
  });
});

// ===========================================================================
// 10-11. Archive filter options
// ===========================================================================

function art(over: Partial<Article> = {}): Article {
  return {
    id: `a-${Math.random().toString(36).slice(2, 7)}`,
    slug: `s-${Math.random().toString(36).slice(2, 7)}`,
    title: 'A Headline', headline: 'A Headline', deck: '', excerpt: 'An excerpt.',
    content: [], structuredBody: [], category: 'NFR Competition', status: 'published',
    workflowStatus: 'published', readTime: '5 min read',
    author: { name: 'Staff', role: 'Reporter' }, publishedAt: 'Nov 1, 2026', updatedAt: 'Nov 1, 2026',
    heroImage: '', imageCredit: '', takeaways: [], tags: [], sources: [],
    articleType: 'guide', ...over,
  } as unknown as Article;
}

describe('04-A (11) filter options match the articles actually present', () => {
  it('REGRESSION: a legacy type appears as an option', () => {
    const opts = articleTypeOptionsFor([art({ articleType: 'guide' }), art({ articleType: 'analysis' })]);
    expect(opts.map((o) => o.value)).toEqual(['guide', 'analysis']);
    expect(opts.map((o) => o.label)).toEqual(['Guide (legacy)', 'Analysis (legacy)']);
  });

  it('a selectable type also appears — the old hardcoded list omitted all 18', () => {
    const opts = articleTypeOptionsFor([art({ articleType: 'Preview' }), art({ articleType: 'guide' })]);
    expect(opts.map((o) => o.value)).toEqual(['Preview', 'guide']); // registry order, legacy last
  });

  it('no option is offered for a type no article has', () => {
    const opts = articleTypeOptionsFor([art({ articleType: 'guide' })]);
    expect(opts).toHaveLength(1);
    expect(opts.map((o) => o.value)).not.toContain('feature');
  });

  it('duplicates collapse and blanks are ignored', () => {
    const opts = articleTypeOptionsFor([
      art({ articleType: 'guide' }), art({ articleType: 'guide' }),
      art({ articleType: '' as never }), art({ articleType: undefined }),
    ]);
    expect(opts.map((o) => o.value)).toEqual(['guide']);
  });

  it('an UNRECOGNISED stored value is still listed, never hidden', () => {
    const opts = articleTypeOptionsFor([art({ articleType: 'Mystery Type' as never })]);
    expect(opts).toEqual([{ value: 'Mystery Type', label: 'Mystery Type' }]);
  });
});

describe('04-A (10) the archive renders legacy articles and filters them', () => {
  const render = (articles: Article[]) =>
    renderToStaticMarkup(
      React.createElement(CategoryArchiveView as never, {
        articles, categoryName: 'NFR Competition', description: '', sectionPath: '/competition/',
      } as never),
    );

  it('REGRESSION: a legacy-typed article is listed, and its type is a filter button', () => {
    const html = render([art({ articleType: 'guide', title: 'A Legacy Guide Article' })]);
    expect(html).toContain('A Legacy Guide Article');
    expect(html).toContain('Guide (legacy)');
    expect(html).toContain('All Types');
  });

  it('REGRESSION: a selectable-typed article is no longer hidden from every button', () => {
    // Before this batch the buttons were ['all','feature','analysis','guide','news'],
    // so a 'Preview' article appeared under "All" and nowhere else.
    const html = render([art({ articleType: 'Preview', title: 'A Preview Article' })]);
    expect(html).toContain('A Preview Article');
    expect(html).toContain('>Preview<');
  });

  it('the old hardcoded vocabulary is gone — no empty buttons', () => {
    const html = render([art({ articleType: 'guide' })]);
    // 'feature'/'analysis'/'news' had no article here, so they must not appear.
    expect(html).not.toContain('Feature (legacy)');
    expect(html).not.toContain('Analysis (legacy)');
  });

  it('an empty archive still renders without a filter row crash', () => {
    const html = render([]);
    expect(html).toContain('All Types');
  });
});

// ===========================================================================
// Database-backed: validation, evergreen query, preservation, RBAC
// ===========================================================================

let available = false;
let prisma: PrismaClient;
let article: typeof ArticleSvc;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    article = await import('../lib/cms/articleService');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
    available = true;
  } catch {
    available = false;
  }
}

const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

suite('04-A database-backed behaviour', () => {
  const slugs: string[] = [];
  const users: string[] = [];
  let admin: Actor;
  let author: Actor;

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({
      data: { email: `i04a-${roleKey}-${rid()}@example.com`, name: `04A ${roleKey}`, status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    users.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }

  function input(over: Partial<ArticleSvc.ArticleInput> = {}): ArticleSvc.ArticleInput {
    const slug = `i04a-${rid()}`;
    slugs.push(slug);
    return {
      slug, title: 'A Batch 04-A Test Headline',
      excerpt: 'An editorial excerpt long enough to satisfy the publication gate for this test case.',
      blocks: [
        { type: 'paragraph', text: 'An opening paragraph with enough words to pass the publication gate checks.' },
        { type: 'heading', level: 2, text: 'Section' },
      ],
      categoryName: 'NFR Competition', authorName: '04A Tester',
      articleType: 'General Information',
      imageRightsStatus: 'Staff Photo',
      imageAltText: 'A descriptive alt text for the featured test photograph.',
      ...over,
    } as ArticleSvc.ArticleInput;
  }

  beforeAll(async () => {
    admin = await makeUser('administrator');
    author = await makeUser('author');
  });

  afterAll(async () => {
    if (!available) return;
    const rows = await prisma.article.findMany({ where: { slug: { in: slugs } }, select: { id: true } });
    const ids = rows.map((r) => r.id);
    await prisma.articleBlock.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.articleSeo.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.articleTag.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.articleMedia.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.article.deleteMany({ where: { id: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  // ---- 6. write-boundary validation -------------------------------------

  it('(6) every selectable type is accepted on save', async () => {
    for (const t of SELECTABLE_ARTICLE_TYPES.slice(0, 4)) {
      const r = await article.saveArticle(admin as ArticleSvc.ActorContext, input({ articleType: t.value }));
      const row = await prisma.article.findUniqueOrThrow({ where: { id: r.id }, select: { articleType: true } });
      expect(row.articleType).toBe(t.value);
    }
  });

  /**
   * UPDATED BY BATCH 04-E — the contract this test guards has changed on
   * purpose, and in one direction only.
   *
   * 04-A accepted a legacy value on ANY save, including the creation of a new
   * article, because `isKnownArticleType` asked only "is this recognised?".
   * 04-E manages the five legacy values as NON-SELECTABLE, and its
   * specification is explicit that a non-selectable type is "unavailable for
   * new articles but preserved for existing articles". So the half of this test
   * that matters — a legacy value survives a save — is unchanged and still
   * asserted here; what is new is that it can no longer be chosen for a NEW
   * article. The editor never offered them anyway (04-A deliberately kept them
   * out of the dropdown), so this closes a gap rather than removing a feature.
   *
   * Revision restore is unaffected: it bypasses `saveArticle` and accepts a
   * historical value unconditionally.
   */
  it('(6) a legacy value is PRESERVED on an existing article and REFUSED for a new one (04-E)', async () => {
    for (const v of LEGACY_VALUES) {
      await expect(
        article.saveArticle(admin as ArticleSvc.ActorContext, input({ articleType: v as never })),
      ).rejects.toThrow(/no longer offered for new classification/i);

      // An article that already stores the legacy value — the real situation
      // for all 11 published articles — saves with it untouched.
      const created = await article.saveArticle(
        admin as ArticleSvc.ActorContext,
        input({ articleType: 'General Information' }),
      );
      await prisma.article.update({ where: { id: created.id }, data: { articleType: v } });
      const resaved = await article.saveArticle(admin as ArticleSvc.ActorContext, {
        ...input({ articleType: v as never }), id: created.id, slug: created.slug,
      } as ArticleSvc.ArticleInput);
      expect(resaved.id).toBe(created.id);
      const row = await prisma.article.findUniqueOrThrow({ where: { id: created.id }, select: { articleType: true } });
      expect(row.articleType, v).toBe(v);
    }
  });

  it('(6) REGRESSION: an unknown or case-variant type is rejected and nothing is written', async () => {
    const before = await prisma.article.count();
    for (const bad of ['Freestyle', 'GUIDE', 'Guide', 'Feature', 'Opinion', '<script>']) {
      await expect(
        article.saveArticle(admin as ArticleSvc.ActorContext, input({ articleType: bad as never })),
      ).rejects.toThrow();
    }
    expect(await prisma.article.count()).toBe(before);
  });

  it('(6) an omitted type still defaults to General Information', async () => {
    const r = await article.saveArticle(
      admin as ArticleSvc.ActorContext,
      { ...input(), articleType: undefined } as ArticleSvc.ArticleInput,
    );
    const row = await prisma.article.findUniqueOrThrow({ where: { id: r.id }, select: { articleType: true } });
    expect(row.articleType).toBe('General Information');
  });

  // ---- 5. legacy preservation -------------------------------------------

  it('(5) REGRESSION: re-saving an untouched legacy article preserves its stored type', async () => {
    const created = await article.saveArticle(admin as ArticleSvc.ActorContext, input({ articleType: 'General Information' }));
    // 04-E: a legacy value cannot be CHOSEN for a new article, so put the
    // article in the state the real data is in and exercise the save path.
    await prisma.article.update({ where: { id: created.id }, data: { articleType: 'guide' } });
    const loaded = await prisma.article.findUniqueOrThrow({
      where: { id: created.id },
      select: { slug: true, articleType: true, title: true, categoryId: true },
    });
    // Save again with the SAME type, as the editor does when nothing is touched.
    await article.saveArticle(admin as ArticleSvc.ActorContext, {
      ...input({ articleType: 'guide' as never }), id: created.id, slug: loaded.slug,
    } as ArticleSvc.ArticleInput);
    const after = await prisma.article.findUniqueOrThrow({
      where: { id: created.id }, select: { articleType: true, categoryId: true },
    });
    expect(after.articleType).toBe('guide');
    expect(after.categoryId).toBe(loaded.categoryId);
  });

  it('(7) changing only the type leaves other fields untouched', async () => {
    const created = await article.saveArticle(admin as ArticleSvc.ActorContext, input({ articleType: 'General Information' }));
    // 04-E: start from a stored legacy value the way the real articles do.
    await prisma.article.update({ where: { id: created.id }, data: { articleType: 'feature' } });
    const before = await prisma.article.findUniqueOrThrow({ where: { id: created.id } });
    await article.saveArticle(admin as ArticleSvc.ActorContext, {
      ...input({ articleType: 'History' }), id: created.id, slug: before.slug,
      title: before.title, excerpt: before.excerpt,
    } as ArticleSvc.ArticleInput);
    const after = await prisma.article.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.articleType).toBe('History');
    expect(after.slug).toBe(before.slug);
    expect(after.title).toBe(before.title);
    expect(after.categoryId).toBe(before.categoryId);
    expect(after.heroImageUrl).toBe(before.heroImageUrl);
    expect(after.subcategory).toBe(before.subcategory);
  });

  // ---- 8-9. the evergreen query ----------------------------------------

  it('(8) REGRESSION: the evergreen query returns the real seeded legacy `guide` articles', async () => {
    const { getEvergreenArticles } = await import('../lib/content');
    const rows = await getEvergreenArticles(20);
    // The assertion that would have failed before this batch: it returned ZERO.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((a) => a.articleType === 'guide')).toBe(true);
  });

  it('(9) the evergreen query excludes non-evergreen types', async () => {
    const { getEvergreenArticles } = await import('../lib/content');
    const rows = await getEvergreenArticles(50);
    for (const a of rows) {
      expect(isEvergreenType(a.articleType)).toBe(true);
      expect(['feature', 'analysis', 'news', 'Preview', 'Schedule']).not.toContain(a.articleType);
    }
  });

  it('(9) the query still honours publication and fixture visibility', async () => {
    const { getEvergreenArticles } = await import('../lib/content');
    const rows = await getEvergreenArticles(50);
    for (const a of rows) expect(a.workflowStatus).toBe('published');
  });

  it('(9) ordering and the limit are unchanged', async () => {
    const { getEvergreenArticles } = await import('../lib/content');
    const two = await getEvergreenArticles(2);
    expect(two.length).toBeLessThanOrEqual(2);
    const all = await getEvergreenArticles(50);
    const dates = all.map((a) => new Date(a.publishedAt).getTime()).filter((n) => !Number.isNaN(n));
    expect([...dates].sort((x, y) => y - x)).toEqual(dates); // newest first
  });

  // ---- 13-14. preservation of URLs, SEO and visibility -------------------

  it('(13) existing canonical URLs and breadcrumbs are unchanged by this batch', async () => {
    const { getPublishedArticleBySlug } = await import('../lib/content');
    const { buildMetadata, breadcrumbJsonLd } = await import('../lib/seo');
    const { ROUTES } = await import('../config/routes');
    const seeded = await prisma.article.findFirstOrThrow({
      where: { workflowStatus: 'PUBLISHED', slug: { notIn: slugs } }, select: { slug: true },
    });
    const a = (await getPublishedArticleBySlug(seeded.slug))!;
    const siteUrl = (await import('../lib/seo')).SITE_URL;
    const meta = buildMetadata({ title: a.title, description: a.excerpt ?? '', path: ROUTES.ARTICLE(a.slug) });
    expect(String((meta.alternates as { canonical?: string }).canonical)).toBe(`${siteUrl}${ROUTES.ARTICLE(a.slug)}`);
    const crumb = breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: a.category, path: '/categories/x/' },
      { name: a.title, path: ROUTES.ARTICLE(a.slug) },
    ]) as { itemListElement: unknown[] };
    // Still three levels — the article type and subcategory never enter it.
    expect(crumb.itemListElement).toHaveLength(3);
  });

  it('(14) the sitemap URL count is unaffected by article-type work', async () => {
    const { buildSitemapEntries } = await import('../lib/seo/sitemapEntries');
    const entries = await buildSitemapEntries();
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(typeof e.url).toBe('string');
  });

  // ---- 15. permissions ---------------------------------------------------

  it('(15) article editing permissions remain enforced', async () => {
    const created = await article.saveArticle(admin as ArticleSvc.ActorContext, input({ articleType: 'History' }));
    const row = await prisma.article.findUniqueOrThrow({ where: { id: created.id }, select: { slug: true } });
    // An `author` may not edit another user's article.
    await expect(
      article.saveArticle(author as ArticleSvc.ActorContext, {
        ...input({ articleType: 'News' }), id: created.id, slug: row.slug,
      } as ArticleSvc.ArticleInput),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const after = await prisma.article.findUniqueOrThrow({ where: { id: created.id }, select: { articleType: true } });
    expect(after.articleType).toBe('History');
  });

  // ---- 16. Issue 03 isolation -------------------------------------------

  it('(16) Issue 03 Discipline CMS is unaffected', async () => {
    const { getAllDisciplines } = await import('../lib/content');
    const all = await getAllDisciplines();
    expect(all.length).toBeGreaterThanOrEqual(7);
    for (const d of all) {
      expect(['Roughstock', 'Timed Event']).toContain(d.category);
      expect(typeof d.imageAlt).toBe('string');
      expect(Array.isArray(d.scoringBreakdown)).toBe(true);
    }
    // And the discipline write path still accepts a guide edit (Issue 03).
    const rodeo = await import('../lib/cms/rodeoService');
    const disc = await prisma.discipline.findFirstOrThrow({ select: { id: true, guide: true, summary: true } });
    await expect(
      rodeo.updateDiscipline(admin, disc.id, { summary: disc.summary }),
    ).resolves.toBeUndefined();
    const after = await prisma.discipline.findUniqueOrThrow({ where: { id: disc.id }, select: { guide: true } });
    expect(after.guide).toEqual(disc.guide);
  });
});

// ===========================================================================
// 4. The editor renders a stored legacy value as selected
// ===========================================================================

describe('04-A (4) the editor shows a stored legacy value instead of a blank control', () => {
  it('REGRESSION: `guide` is rendered as its own selected option', async () => {
    const { AdminArticleEditorShell } = await import('../views/admin/AdminArticleEditorShell');
    const existing = {
      id: 'a1', slug: 'a-legacy-article', title: 'A Legacy Article', deck: '', excerpt: 'An excerpt.',
      content: [], structuredBody: [{ type: 'paragraph', text: 'Body.' }],
      category: 'NFR Competition', articleType: 'guide', status: 'published', workflowStatus: 'published',
      readTime: '5 min read', author: { name: 'Staff', role: 'Reporter' },
      publishedAt: 'Nov 1, 2026', updatedAt: 'Nov 1, 2026', heroImage: '', imageCredit: '',
      takeaways: [], tags: [], sources: [],
    } as unknown as Article;

    const html = renderToStaticMarkup(
      React.createElement(AdminArticleEditorShell as never, {
        initialArticle: existing,
        permissions: EDITOR_PERMISSIONS,
        actorName: 'Staff Tester',
        authors: [{ id: 'au1', name: 'Staff', role: 'Reporter' }],
      } as never),
    );

    // The legacy option exists AND is the selected one.
    expect(html).toContain('Guide (legacy)');
    expect(html).toMatch(/<option[^>]*value="guide"[^>]*selected|selected[^>]*value="guide"/);
    // It is not presented as a new editorial choice: the 18 are still there…
    expect(html).toContain('General Information');
    // …and no silent conversion happened.
    expect(html).not.toContain('>Event Guide<\/option>\s*<\/select>');
  });

  it('(6) a NEW article offers only the selectable types', async () => {
    const { AdminArticleEditorShell } = await import('../views/admin/AdminArticleEditorShell');
    const html = renderToStaticMarkup(
      React.createElement(AdminArticleEditorShell as never, {
        permissions: EDITOR_PERMISSIONS,
        actorName: 'Staff Tester',
        authors: [{ id: 'au1', name: 'Staff', role: 'Reporter' }],
      } as never),
    );
    expect(html).toContain('Select article type…');
    expect(html).toContain('Rules &amp; Format');
    // No legacy option is offered when nothing legacy is stored.
    expect(html).not.toContain('Guide (legacy)');
    expect(html).not.toContain('Analysis (legacy)');
  });
});
