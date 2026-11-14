/**
 * Batch S / S1 — public article metadata from stored ArticleSeo overrides.
 *
 * Pure functions (no DB, no Next.js runtime) so they are unit-testable. The article
 * route passes the result to `buildMetadata` (lib/seo.tsx), which stays the single
 * metadata builder. Only PUBLISHED articles reach this code: the route loads them via
 * `getPublishedArticleBySlug` (publicArticleWhere), so drafts never expose metadata.
 *
 * Fallbacks (blank override → existing behaviour, unchanged):
 *   title       ArticleSeo.seoTitle      → article.title
 *   description ArticleSeo.metaDescription → article.deck → article.excerpt → generic line
 *   image       ArticleSeo.ogImage        → article.heroImage (→ buildMetadata default)
 *   canonical   same-site ArticleSeo.canonicalUrl (lib/seo/canonical.ts, re-based on SITE_URL) → self path
 *   robots      parsed ArticleSeo.robots (lib/seo/robots.ts, all four combinations) → index, follow
 */
import { SITE_URL, buildMetadata } from '../seo';
import { ROUTES, articleUrl } from '../../config/routes';
import type { Article } from '../../types';
import { parseRobotsDirective, UNAVAILABLE_ARTICLE_ROBOTS } from './robots';
import { normalizeSameSiteCanonical as normalizeCanonical } from './canonical';

// Re-exported for existing S1 callers/tests; the single implementation lives in ./robots.
export { parseRobotsDirective, type RobotsPolicy } from './robots';

export const ARTICLE_DESCRIPTION_FALLBACK =
  'Independent rodeo journalism and championship analysis from NFRGuide.';

/**
 * Normalise a stored canonical to an absolute URL on SITE_URL, or null when it is not
 * same-site (owner decision: off-site canonicals are ignored → self-canonical).
 * Batch S5: delegates to the single normalizer in ./canonical (which also recognises the
 * production origin, so stored production URLs re-base onto the current SITE_URL).
 * Stored values are never rewritten — this runs at render time only.
 */
export function normalizeSameSiteCanonical(
  value: string | null | undefined,
  siteUrl: string = SITE_URL,
): string | null {
  return normalizeCanonical(value, siteUrl);
}

/** Metadata input when the requested article is not published/available: noindex, follow. */
export function unavailableArticleMetadataInput(slug: string): Parameters<typeof buildMetadata>[0] {
  return {
    title: 'Dispatch Unavailable',
    description: 'The requested editorial dispatch is currently unavailable.',
    path: `/articles/${slug}/`,
    robots: { ...UNAVAILABLE_ARTICLE_ROBOTS },
  };
}

/** Input for `buildMetadata` for a published article, applying stored ArticleSeo overrides. */
export function articleMetadataInput(
  article: Article,
  siteUrl: string = SITE_URL,
): Parameters<typeof buildMetadata>[0] {
  const seo = article.seo;
  return {
    title: seo?.storedTitle || article.title,
    description: seo?.storedDescription || article.deck || article.excerpt || ARTICLE_DESCRIPTION_FALLBACK,
    path: articleUrl(article),
    image: seo?.ogImage?.trim() || article.heroImage,
    type: 'article',
    publishedTime: article.publishedAt,
    authorName: article.author.name,
    canonical: normalizeSameSiteCanonical(seo?.canonicalUrl, siteUrl) ?? undefined,
    // Batch S3: independent index/follow from the stored directive (blank → index, follow).
    robots: parseRobotsDirective(seo?.robots),
  };
}
