import 'server-only';
import { prisma } from '../db';
import { publicArticleWhere } from '../fixturePolicy';
import { articleInclude, toArticle } from '../mappers';
import type { Article } from '../../types';
import { PRIMARY_SECTIONS } from '../../config/routes';

/**
 * The public subcategory archive — `/<subcategory>/`.
 *
 * A subcategory is a full entity page now, not a filtered list: it carries a
 * hero, an editor-written summary and guide, admin SEO, FAQs and a page-view
 * beacon, the same surface a discipline guide has. This module is the one place
 * that decides what such a page contains and whether it may be indexed.
 */

/** The minimum number of published articles an archive needs to be indexable. */
export const SUBCATEGORY_INDEX_THRESHOLD = 3;

export interface PublicSubcategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  summary: string | null;
  image: string | null;
  imageCredit: string | null;
  guide: unknown;
  archivedAt: Date | null;
  /** The owning primary section — absent from the URL, still shown to readers. */
  section: { name: string; path: string; slug: string };
  articles: Article[];
  /**
   * Whether a search engine may index this archive.
   *
   * An archive holding one article is a near-duplicate of that article: the
   * same headline, the same deck, no other content. Publishing a few dozen of
   * those is the classic thin/duplicate-content pattern, and it costs the whole
   * site rather than only the thin pages. So an archive below the threshold
   * still renders at HTTP 200 and still carries its links — it is simply not
   * offered to search engines, and it stays out of the sitemap, until enough
   * articles make it worth reading on its own.
   *
   * An ARCHIVED subcategory is never indexable whatever its article count,
   * matching the discipline archive convention.
   */
  indexable: boolean;
}

function sectionForCategory(categoryName: string): { name: string; path: string; slug: string } {
  const match = Object.values(PRIMARY_SECTIONS).find((s) => s.categoryKey === categoryName);
  return match
    ? { name: match.name, path: match.path, slug: match.id }
    : { name: categoryName, path: '/', slug: '' };
}

export async function getSubcategoryBySlug(slug: string): Promise<PublicSubcategory | null> {
  const row = await prisma.subcategory.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, name: true, description: true, summary: true,
      image: true, imageCredit: true, guide: true, archivedAt: true,
      category: { select: { name: true } },
    },
  });
  if (!row) return null;

  const articles = (
    await prisma.article.findMany({
      where: { ...publicArticleWhere(), subcategoryId: row.id },
      include: articleInclude,
      orderBy: { publishedAt: 'desc' },
    })
  ).map(toArticle);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    summary: row.summary,
    image: row.image,
    imageCredit: row.imageCredit,
    guide: row.guide,
    archivedAt: row.archivedAt,
    section: sectionForCategory(row.category.name),
    articles,
    indexable: !row.archivedAt && articles.length >= SUBCATEGORY_INDEX_THRESHOLD,
  };
}

/**
 * Every subcategory slug, for `generateStaticParams` on the shared depth-1
 * route. Archived ones are included deliberately: their URL stays reachable at
 * HTTP 200 with `noindex` rather than breaking links that already exist.
 */
export async function getAllSubcategorySlugs(): Promise<string[]> {
  const rows = await prisma.subcategory.findMany({ select: { slug: true }, orderBy: { slug: 'asc' } });
  return rows.map((r) => r.slug);
}

/**
 * The cards shown on a primary section's landing page.
 *
 * Only ACTIVE subcategories of that section, in the operator's own sort order.
 * The article count comes from `publicArticleWhere()` rather than a raw
 * relation count, so an unpublished or fixture article never inflates what a
 * reader is promised.
 */
export interface SubcategoryCard {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  image: string | null;
  articleCount: number;
}

export async function getSubcategoryCardsForSection(categoryKey: string): Promise<SubcategoryCard[]> {
  const rows = await prisma.subcategory.findMany({
    where: { archivedAt: null, category: { name: categoryKey } },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, slug: true, name: true, summary: true, description: true, image: true },
  });
  if (rows.length === 0) return [];

  const counts = await prisma.article.groupBy({
    by: ['subcategoryId'],
    where: { ...publicArticleWhere(), subcategoryId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  const countBy = new Map(counts.map((c) => [c.subcategoryId, c._count._all]));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    // `summary` is the landing-page line; `description` is the older admin note.
    // Falling back keeps existing rows useful before anyone writes a summary.
    summary: r.summary ?? r.description,
    image: r.image,
    articleCount: countBy.get(r.id) ?? 0,
  }));
}
