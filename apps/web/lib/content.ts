import 'server-only';
import { WorkflowStatus } from '@prisma/client';
import { prisma } from './db';
import { publicArticleWhere } from './fixturePolicy';
import { articleInclude, toArticle, toDiscipline } from './mappers';
import { Article, Discipline, SearchIndexItem } from '../types';
import { PRIMARY_SECTIONS, SectionMeta } from '../config/routes';
import { ACTIVE_ONLY } from './cms/lifecycle';

/**
 * NFRGuide — Server-only published content repository (Batch 02 §8).
 *
 * Every PUBLIC read goes through here. All article reads are constrained to
 * `workflowStatus = PUBLISHED`, so draft / in_review / approved / scheduled /
 * archived content can never reach a public response (eligibility is enforced
 * in the database query, not the client). This module is `server-only`.
 *
 * It replaces the Batch 01 static adapter of the same name and path, so the
 * public pages' imports are unchanged (their calls simply became `await`ed).
 *
 * Phase 2: the homepage/section modules that were Phase 0 static content are now
 * fed from published articles (and the DB rodeo directory); no static mock data
 * reaches public pages. Quick-access is plain navigation (config/quickAccess.ts).
 */

const PUBLISHED = WorkflowStatus.PUBLISHED;

// ---- Articles --------------------------------------------------------------

export async function getPublishedArticles(): Promise<Article[]> {
  const rows = await prisma.article.findMany({
    where: { ...publicArticleWhere() },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
  });
  return rows.map(toArticle);
}

export async function getPublishedArticleBySlug(slug: string): Promise<Article | null> {
  const row = await prisma.article.findFirst({
    where: { slug, ...publicArticleWhere() },
    include: articleInclude,
  });
  return row ? toArticle(row) : null;
}

export async function getPublishedArticlesBySection(
  categoryKey: string,
  opts: { limit?: number; excludeIds?: string[] } = {},
): Promise<Article[]> {
  const rows = await prisma.article.findMany({
    where: {
      ...publicArticleWhere(),
      category: { name: categoryKey },
      ...(opts.excludeIds?.length ? { id: { notIn: opts.excludeIds } } : {}),
    },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
    ...(opts.limit ? { take: opts.limit } : {}),
  });
  return rows.map(toArticle);
}

/** Published articles for hand-picked IDs, returned in the given order (unpublished/missing IDs are dropped). */
export async function getPublishedArticlesByIds(ids: string[]): Promise<Article[]> {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 50);
  if (unique.length === 0) return [];
  const rows = await prisma.article.findMany({
    where: { ...publicArticleWhere(), id: { in: unique } },
    include: articleInclude,
  });
  const byId = new Map(rows.map((r) => [r.id, toArticle(r)]));
  return unique.map((id) => byId.get(id)).filter((a): a is Article => Boolean(a));
}

export async function getPublishedArticlesByCategory(categorySlug: string): Promise<Article[]> {
  const rows = await prisma.article.findMany({
    where: { ...publicArticleWhere(), category: { slug: categorySlug } },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
  });
  return rows.map(toArticle);
}

export async function getPublishedArticlesByDiscipline(
  disciplineSlug: string,
  limit = 3,
): Promise<Article[]> {
  const linked = await prisma.article.findMany({
    where: { ...publicArticleWhere(), disciplines: { some: { discipline: { slug: disciplineSlug } } } },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
  });
  if (linked.length > 0) return linked.map(toArticle);

  // Fallback: competition coverage when no explicit links exist.
  const fallback = await prisma.article.findMany({
    where: { ...publicArticleWhere(), category: { name: 'NFR Competition' } },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return fallback.map(toArticle);
}

export async function getRelatedPublishedArticles(
  articleId: string,
  limit = 3,
): Promise<Article[]> {
  const curated = await prisma.article.findMany({
    where: {
      ...publicArticleWhere(),
      id: { not: articleId },
      relatedFrom: { some: { sourceId: articleId } },
    },
    include: articleInclude,
    take: limit,
  });
  if (curated.length > 0) return curated.map(toArticle);

  const current = await prisma.article.findUnique({
    where: { id: articleId },
    select: { categoryId: true },
  });
  const rows = await prisma.article.findMany({
    where: {
      ...publicArticleWhere(),
      id: { not: articleId },
      ...(current ? { categoryId: current.categoryId } : {}),
    },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return rows.map(toArticle);
}

/** Batch 01 compatibility alias (same published-only guarantee). */
export const getRelatedArticles = getRelatedPublishedArticles;

const ARTICLE_PATH = /^\/articles\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/;

/**
 * Resolve an article slug that no longer renders to its redirect target (ADM-14 / WEB-11).
 * Only ACTIVE redirects whose destination is an internal article path of a PUBLISHED
 * article are honoured — anything else falls through to 404 (no open or dangling redirect).
 */
export async function resolveArticleRedirect(slug: string): Promise<{ destination: string; permanent: boolean } | null> {
  const r = await prisma.articleRedirect.findFirst({
    where: { sourcePath: `/articles/${slug}/`, status: 'ACTIVE' },
    select: { targetPath: true, statusCode: true },
  });
  const target = r ? ARTICLE_PATH.exec(r.targetPath) : null;
  if (!r || !target) return null;
  const live = await prisma.article.findFirst({ where: { slug: target[1], ...publicArticleWhere() }, select: { id: true } });
  if (!live) return null;
  return { destination: r.targetPath, permanent: r.statusCode === 301 || r.statusCode === 308 };
}

export async function getPublishedArticleSlugs(): Promise<string[]> {
  const rows = await prisma.article.findMany({
    where: { ...publicArticleWhere() },
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}

// ---- Homepage feeds --------------------------------------------------------

export async function getHeroArticle(): Promise<Article | null> {
  const lead = await prisma.article.findFirst({
    where: { ...publicArticleWhere(), isLeadHero: true },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
  });
  if (lead) return toArticle(lead);
  const latest = await prisma.article.findFirst({
    where: { ...publicArticleWhere() },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
  });
  return latest ? toArticle(latest) : null;
}

export async function getSecondaryHeroStories(limit = 2, excludeId?: string): Promise<Article[]> {
  const rows = await prisma.article.findMany({
    where: {
      ...publicArticleWhere(),
      isFeatured: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return rows.map(toArticle);
}

export async function getLatestArticles(limit = 6, excludeIds: string[] = []): Promise<Article[]> {
  const rows = await prisma.article.findMany({
    where: {
      ...publicArticleWhere(),
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
    },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return rows.map(toArticle);
}

/** Article types treated as evergreen learning content (Requirements v2.0 §6.2 seed types). */
export const EVERGREEN_ARTICLE_TYPES = ['Rules & Format', 'History', 'Records & Past Winners', 'General Information'];

export async function getEvergreenArticles(limit = 4): Promise<Article[]> {
  const rows = await prisma.article.findMany({
    where: { ...publicArticleWhere(), articleType: { in: EVERGREEN_ARTICLE_TYPES } },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return rows.map(toArticle);
}

export async function getPublishedSearchIndex(): Promise<SearchIndexItem[]> {
  const rows = await prisma.article.findMany({
    where: { ...publicArticleWhere() },
    select: { id: true, slug: true, title: true, deck: true, readTime: true, category: { select: { name: true } } },
    orderBy: { publishedAt: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    deck: r.deck ?? '',
    category: r.category.name,
    readTime: r.readTime ?? '',
  }));
}

// ---- Categories & disciplines ---------------------------------------------

export async function getPublishedCategories(): Promise<{ slug: string; name: string }[]> {
  const rows = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  return rows.map((c) => ({ slug: c.slug, name: c.name }));
}

/** Category row by slug (for landing SEO/FAQ keying — Batch 11). */
export async function getCategoryBySlug(slug: string): Promise<{ id: string; slug: string; name: string; description: string | null } | null> {
  const c = await prisma.category.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, description: true } });
  return c ?? null;
}

export async function getAllDisciplines(): Promise<Discipline[]> {
  // Archived disciplines leave active listings (lib/cms/lifecycle.ts).
  const rows = await prisma.discipline.findMany({ where: ACTIVE_ONLY, orderBy: { sortOrder: 'asc' } });
  return rows.map(toDiscipline);
}

export async function getRodeoDisciplineBySlug(slug: string): Promise<Discipline | null> {
  const row = await prisma.discipline.findUnique({ where: { slug } });
  return row ? toDiscipline(row) : null;
}

/** Batch 01 compatibility alias. */
export const getDisciplineBySlug = getRodeoDisciplineBySlug;

// ---- Section route metadata (config defaults merged with DB overrides) ------

export async function getSectionMeta(sectionKey: string): Promise<SectionMeta | undefined> {
  const base = PRIMARY_SECTIONS[sectionKey];
  if (!base) return undefined;
  const override = await prisma.sectionConfig.findUnique({ where: { sectionKey } });
  if (!override) return base;
  return {
    ...base,
    name: override.displayName || base.name,
    tagline: override.tagline || base.tagline,
    description: override.description || base.description,
  };
}

export function getAllSectionKeys(): string[] {
  return Object.keys(PRIMARY_SECTIONS);
}

export function getSectionMetaByCategorySlug(slug: string): SectionMeta | undefined {
  const clean = slug.toLowerCase();
  return Object.values(PRIMARY_SECTIONS).find(
    (s) => s.id === clean || s.categoryKey.toLowerCase().replace(/[^a-z0-9]+/g, '-') === clean,
  );
}
