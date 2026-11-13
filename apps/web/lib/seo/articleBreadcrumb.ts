import { PRIMARY_SECTIONS } from '../../config/routes';
import type { Article } from '../../types';

/**
 * Stage 03 (R-3) — where an article's category crumb points.
 *
 * THE DEFECT. `ArticleHeader` matched the article's category name against the
 * five compiled-in sections and, finding nothing, fell back to `/competition/`:
 *
 *     const sectionEntry = Object.values(PRIMARY_SECTIONS).find(
 *       (s) => s.categoryKey === article.category);
 *     const categoryPath = sectionEntry?.path || '/competition/';
 *
 * An article in an administrator-created category therefore linked to NFR
 * Competition — a silent substitution of an unrelated section, and the visible
 * breadcrumb disagreed with the JSON-LD, which built its own path from a
 * slugified name.
 *
 * THE RULE, and why both halves exist:
 *
 *   1. A canonical section keeps its established public URL (`/competition/`,
 *      `/plan-watch/`, …). Those URLs are load-bearing — navigation, the
 *      sitemap and EntitySeo ids all use them — so they must not move.
 *   2. Anything else uses `/categories/<slug>/`, which is exactly where its
 *      archive lives after Stage 02.
 *
 * PURE AND SYNCHRONOUS on purpose. It reads only fields the article already
 * carries (`category`, `categorySlug`, both from one join), so the server page
 * and the client header can call the same function and cannot diverge, and no
 * query is added anywhere — there is no N+1 to introduce.
 */
export interface ArticleCategoryCrumb {
  name: string;
  path: string;
  /** True when the slug resolved from data rather than from a name heuristic. */
  resolved: boolean;
}

/** Last-resort slugification, used only when the article carries no slug. */
function slugifyCategoryName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function articleCategoryCrumb(
  article: Pick<Article, 'category' | 'categorySlug'>,
): ArticleCategoryCrumb {
  const name = article.category;
  const canonical = Object.values(PRIMARY_SECTIONS).find((s) => s.categoryKey === name);
  if (canonical) {
    return { name, path: canonical.path, resolved: true };
  }

  /**
   * Not a canonical section. Prefer the slug the article carries; fall back to
   * slugifying the name only when it is absent — a historical record, a test
   * fixture, or a caller that built an `Article` by hand. Either way the link
   * stays inside `/categories/`, so a missing or renamed category can never
   * send a reader to an unrelated section.
   */
  const slug = article.categorySlug?.trim() || slugifyCategoryName(name);
  return {
    name,
    path: `/categories/${slug}/`,
    resolved: !!article.categorySlug?.trim(),
  };
}
