import 'server-only';
import { WorkflowStatus } from '@prisma/client';
import { prisma } from './db';
import { publicArticleWhere } from './fixturePolicy';
import { articleInclude, toArticle, toDiscipline } from './mappers';
import { Article, Discipline, SearchIndexItem } from '../types';
import { PRIMARY_SECTIONS, SectionMeta } from '../config/routes';
import { ACTIVE_ONLY } from './cms/lifecycle';
import { EVERGREEN_ARTICLE_TYPE_VALUES } from './content/articleTypes';
import { getEvergreenArticleTypeValues } from './cms/articleTypeRegistry';

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
/**
 * Batch 04-A — derived from the authoritative registry, not a second list.
 *
 * This used to be four hardcoded Title-Case values. Every one of the 11
 * published articles stores a lowercase legacy value, so the SQL `IN` below
 * matched **zero rows** and the evergreen surface was permanently, silently
 * empty. The registry marks `guide` and `explainer` evergreen per the approved
 * matrix, which is what gives the surface its six real articles.
 *
 * Batch 04-E — the eligibility list is now ADMINISTRATOR-MANAGED, so this
 * constant is no longer what the query reads. It is kept, unchanged, as the
 * compatibility value for existing importers and as the documented fallback
 * when the managed table has not been initialised.
 *
 * @deprecated for querying — use `getEvergreenArticleTypeValues()`, which
 * returns the managed list and falls back to exactly this one.
 */
export const EVERGREEN_ARTICLE_TYPES: readonly string[] = EVERGREEN_ARTICLE_TYPE_VALUES;

export async function getEvergreenArticles(limit = 4): Promise<Article[]> {
  /**
   * Batch 04-E — eligibility comes from the managed registry.
   *
   * One extra read per call, cached in-process for 10 s and shared with the
   * editor and the JSON-LD path, so this is not an N+1: the article query
   * itself is unchanged, still a single `findMany`.
   *
   * An EMPTY list would silently empty the surface — the Batch 04-A failure —
   * so the registry never returns one: it falls back to the compatibility
   * values when the table is absent or uninitialised.
   */
  const evergreenValues = await getEvergreenArticleTypeValues();
  const rows = await prisma.article.findMany({
    // `publicArticleWhere()` is applied first and unchanged, so publication,
    // visibility and fixture filtering keep their existing behaviour.
    where: { ...publicArticleWhere(), articleType: { in: evergreenValues } },
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

/**
 * Issue 03 — attach the Media Library asset behind each discipline hero.
 *
 * `Discipline.image` stores a URL string rather than a media id, so the asset
 * is looked up by that URL — the same thing the SEO audit engine does. ONE
 * batched query for the whole set, so a list of disciplines costs a constant
 * extra query rather than one per row. Heroes that are not DAM-managed (a
 * `/assets/images/…` path, or empty) are skipped entirely and simply resolve to
 * the existing fallback behaviour.
 */
async function withHeroAssets<T extends { image: string | null }>(
  rows: T[],
): Promise<(T & { heroAsset: Parameters<typeof toDiscipline>[0]['heroAsset'] })[]> {
  const urls = [...new Set(rows.map((r) => r.image).filter((u): u is string => !!u && u.startsWith('/api/media/')))];
  const assets = urls.length
    ? await prisma.mediaAsset.findMany({
        where: { url: { in: urls } },
        select: { url: true, altText: true, caption: true, derivatives: true, width: true, height: true, storageKey: true },
      })
    : [];
  const byUrl = new Map(assets.map((a) => [a.url, { ...a, url: a.url }]));
  return rows.map((r) => ({ ...r, heroAsset: (r.image && byUrl.get(r.image)) || null }));
}

export async function getAllDisciplines(): Promise<Discipline[]> {
  // Archived disciplines leave active listings (lib/cms/lifecycle.ts).
  /**
   * Batch 05 — the managed classification is included so the public Competition
   * filter can group by a stable id instead of the display label.
   *
   * The include is attempted and the query retried without it if the table does
   * not exist, because this function feeds the homepage and the Competition
   * section: those pages must still render on an environment where the
   * classification migration has not been applied. Falling back costs one extra
   * query only in that case, and `toDiscipline` already treats the relation as
   * optional.
   */
  let rows;
  try {
    rows = await prisma.discipline.findMany({
      where: ACTIVE_ONLY,
      orderBy: { sortOrder: 'asc' },
      include: { classification: { select: { id: true, name: true, pluralName: true } } },
    });
  } catch {
    rows = await prisma.discipline.findMany({ where: ACTIVE_ONLY, orderBy: { sortOrder: 'asc' } });
  }
  return (await withHeroAssets(rows)).map(toDiscipline);
}

export async function getRodeoDisciplineBySlug(slug: string): Promise<Discipline | null> {
  const row = await prisma.discipline.findUnique({ where: { slug } });
  if (!row) return null;
  const [enriched] = await withHeroAssets([row]);
  return toDiscipline(enriched);
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

/**
 * Stage 02 (H-02, H-03) — the ONE resolver for a category archive's editorial
 * identity, shared by `/categories/[slug]` metadata and its rendered view.
 *
 * THE DEFECT IT REPLACES. `/[section]` applied the administrator's
 * `SectionConfig` override through `getSectionMeta`, while `/categories/[slug]`
 * called the synchronous `getSectionMetaByCategorySlug`, which reads
 * `config/routes.ts` and nothing else. The same section rendered under two
 * public URLs disagreed about its own name and description, and the
 * administrator-editable `Category.description` was read by neither.
 *
 * PRECEDENCE, highest first. Each field resolves independently, and an empty
 * string never wins — a blank override falls through to the next source:
 *
 *   NAME         SectionConfig.displayName → Category.name → config name → slug
 *   DESCRIPTION  SectionConfig.description → Category.description → config description
 *
 * `EntitySeo` sits ABOVE both and is applied later by `mergeSeoMeta`, so an
 * explicit SEO title/description override stays authoritative for metadata.
 * That ordering is deliberate: `SectionConfig` is the per-section presentation
 * override an administrator set in Settings, `Category` is the general
 * editorial record, and `config/routes.ts` is the shipped default for the five
 * foundational sections.
 *
 * `known` is false only when the slug names NEITHER a canonical section NOR a
 * managed category — the Stage 01 (B-01) noindex condition, now computed once
 * instead of at each call site.
 */
export interface CategoryArchiveIdentity {
  known: boolean;
  /** Canonical section key when this slug is one of the five, else null. */
  sectionKey: string | null;
  /** Managed `Category.id` when a row exists — the key for EntitySeo and FAQs. */
  categoryId: string | null;
  /** The name articles are classified under, used to select them. */
  categoryKey: string | null;
  name: string;
  description: string;
}

export async function resolveCategoryArchive(slug: string): Promise<CategoryArchiveIdentity> {
  const section = getSectionMetaByCategorySlug(slug);
  const [row, override] = await Promise.all([
    prisma.category.findUnique({
      where: { slug },
      select: { id: true, name: true, description: true },
    }),
    section
      ? prisma.sectionConfig.findUnique({ where: { sectionKey: section.id } })
      : Promise.resolve(null),
  ]);

  const pick = (...candidates: (string | null | undefined)[]): string =>
    candidates.find((c) => typeof c === 'string' && c.trim().length > 0)?.trim() ?? '';

  const name = pick(override?.displayName, row?.name, section?.name, slug.replace(/-/g, ' '));
  const description = pick(override?.description, row?.description, section?.description);

  return {
    known: !!section || !!row,
    sectionKey: section?.id ?? null,
    categoryId: row?.id ?? null,
    // Articles are classified by the section's canonical key when there is one,
    // otherwise by the managed category's own name.
    categoryKey: section?.categoryKey ?? row?.name ?? null,
    name,
    description,
  };
}
