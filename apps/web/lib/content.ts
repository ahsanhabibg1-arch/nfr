import 'server-only';
import { WorkflowStatus } from '@prisma/client';
import { prisma } from './db';
import { articleInclude, toArticle, toDiscipline } from './mappers';
import { Article, Discipline, SearchIndexItem } from '../types';
import { PRIMARY_SECTIONS, SectionMeta } from '../config/routes';

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
 * BOUNDARY (documented, Batch 02 §9): articles, categories and disciplines are
 * database-backed. The non-article homepage/section decorative modules
 * (entertainment features, shopping events, plan & watch guide cards, rodeo hub
 * & event cards, learning resources, quick-access) remain Phase 0 static content
 * and are NOT yet in the content database — see KNOWN_LIMITATIONS.md.
 */

const PUBLISHED = WorkflowStatus.PUBLISHED;

// ---- Articles --------------------------------------------------------------

export async function getPublishedArticles(): Promise<Article[]> {
  const rows = await prisma.article.findMany({
    where: { workflowStatus: PUBLISHED },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
  });
  return rows.map(toArticle);
}

export async function getPublishedArticleBySlug(slug: string): Promise<Article | null> {
  const row = await prisma.article.findFirst({
    where: { slug, workflowStatus: PUBLISHED },
    include: articleInclude,
  });
  return row ? toArticle(row) : null;
}

export async function getPublishedArticlesBySection(categoryKey: string): Promise<Article[]> {
  const rows = await prisma.article.findMany({
    where: { workflowStatus: PUBLISHED, category: { name: categoryKey } },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
  });
  return rows.map(toArticle);
}

export async function getPublishedArticlesByCategory(categorySlug: string): Promise<Article[]> {
  const rows = await prisma.article.findMany({
    where: { workflowStatus: PUBLISHED, category: { slug: categorySlug } },
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
    where: { workflowStatus: PUBLISHED, disciplines: { some: { discipline: { slug: disciplineSlug } } } },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
  });
  if (linked.length > 0) return linked.map(toArticle);

  // Fallback: competition coverage when no explicit links exist.
  const fallback = await prisma.article.findMany({
    where: { workflowStatus: PUBLISHED, category: { name: 'NFR Competition' } },
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
      workflowStatus: PUBLISHED,
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
      workflowStatus: PUBLISHED,
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

export async function getPublishedArticleSlugs(): Promise<string[]> {
  const rows = await prisma.article.findMany({
    where: { workflowStatus: PUBLISHED },
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}

// ---- Homepage feeds --------------------------------------------------------

export async function getHeroArticle(): Promise<Article | null> {
  const lead = await prisma.article.findFirst({
    where: { workflowStatus: PUBLISHED, isLeadHero: true },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
  });
  if (lead) return toArticle(lead);
  const latest = await prisma.article.findFirst({
    where: { workflowStatus: PUBLISHED },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
  });
  return latest ? toArticle(latest) : null;
}

export async function getSecondaryHeroStories(limit = 2, excludeId?: string): Promise<Article[]> {
  const rows = await prisma.article.findMany({
    where: {
      workflowStatus: PUBLISHED,
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
      workflowStatus: PUBLISHED,
      ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
    },
    include: articleInclude,
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return rows.map(toArticle);
}

export async function getPublishedSearchIndex(): Promise<SearchIndexItem[]> {
  const rows = await prisma.article.findMany({
    where: { workflowStatus: PUBLISHED },
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

export async function getAllDisciplines(): Promise<Discipline[]> {
  const rows = await prisma.discipline.findMany({ orderBy: { sortOrder: 'asc' } });
  return rows.map(toDiscipline);
}

export async function getRodeoDisciplineBySlug(slug: string): Promise<Discipline | null> {
  const row = await prisma.discipline.findUnique({ where: { slug } });
  return row ? toDiscipline(row) : null;
}

/** Batch 01 compatibility alias. */
export const getDisciplineBySlug = getRodeoDisciplineBySlug;

// ---- Section route metadata (static routing config, not DB) ----------------

export function getSectionMeta(sectionKey: string): SectionMeta | undefined {
  return PRIMARY_SECTIONS[sectionKey];
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
