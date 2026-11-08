/**
 * Batch S / S4 — the single SEO indexing & sitemap-eligibility policy.
 *
 * Pure functions (no DB, no Next runtime). Data loaders (lib/seo/sitemapEntries.ts) turn
 * each content type's records into an `SeoSubject` — preserving that type's existing
 * content/eligibility rules — and these functions decide, the same way for every type:
 *
 *   published  — the URL renders publicly (exists, published, not a hidden fixture)
 *   indexable  — published AND effective robots index:true (content rules + stored
 *                ArticleSeo.robots + EntitySeo.noindex, combined most-restrictively)
 *   in sitemap — indexable AND self-canonical AND the type is sitemap-eligible
 *
 * Robots `follow` never affects sitemap eligibility (a noindex,follow page is excluded
 * exactly like a noindex,nofollow one); only `index` does.
 */
import {
  type RobotsPolicy, combineRobots, parseRobotsDirective,
  INDEX_FOLLOW, EDITOR_NOINDEX, LEGACY_NOINDEX,
} from './robots';
import { canonicalUrlKey } from './canonical';

export interface SeoSubject {
  /** Self path, beginning and ending with "/" (e.g. "/articles/x/"). */
  path: string;
  /** Renders publicly (published workflow / public record / not a hidden fixture). */
  published: boolean;
  /**
   * The type's existing content-eligibility rule (e.g. hub has events or articles,
   * venue has content, coverage page has published rows, legal page approved or
   * published). `false` is a content-based noindex (noindex, nofollow). Default true.
   */
  contentEligible?: boolean;
  /** Stored ArticleSeo.robots directive (articles only). */
  storedRobots?: string | null;
  /** EntitySeo.noindex (editor). */
  editorNoindex?: boolean;
  /**
   * Effective canonical as rendered: an absolute same-site URL already resolved by the
   * page's own rule (normalizeSameSiteCanonical for articles, resolveCanonical for
   * EntitySeo), or null/undefined when the page is self-canonical.
   */
  canonical?: string | null;
  /** Whether this content type is listed in the sitemap at all. Default true. */
  sitemapType?: boolean;
}

export type SitemapExclusionReason =
  | 'unpublished'
  | 'content-noindex'
  | 'stored-robots-noindex'
  | 'editor-noindex'
  | 'canonical-away'
  | 'type-not-in-sitemap';

export function isPublished(s: SeoSubject): boolean {
  return s.published;
}

/** The robots policy the page renders (most restrictive of all applicable sources). */
export function effectiveRobots(s: SeoSubject): RobotsPolicy {
  return combineRobots(
    s.contentEligible === false ? LEGACY_NOINDEX : INDEX_FOLLOW,
    s.storedRobots !== undefined ? parseRobotsDirective(s.storedRobots) : INDEX_FOLLOW,
    s.editorNoindex ? EDITOR_NOINDEX : INDEX_FOLLOW,
  );
}

export function isIndexable(s: SeoSubject): boolean {
  return isPublished(s) && effectiveRobots(s).index;
}

/**
 * Comparison key for a URL: lower-cased host (no "www."), collapsed slashes, trailing
 * slash, no query/hash. Batch S5: delegates to the single normalizer (./canonical).
 */
export function canonicalKey(url: string, siteUrl: string): string | null {
  return canonicalUrlKey(url, siteUrl);
}

/** True when the effective canonical is absent or points at the page's own URL. */
export function isCanonicalSelf(s: Pick<SeoSubject, 'path' | 'canonical'>, siteUrl: string): boolean {
  if (!s.canonical || !s.canonical.trim()) return true;
  const self = canonicalKey(`${siteUrl.replace(/\/+$/, '')}${s.path}`, siteUrl);
  const target = canonicalKey(s.canonical.trim(), siteUrl);
  return !!self && self === target;
}

/** First reason a subject is excluded from the sitemap, or null when it is included. */
export function sitemapExclusionReason(s: SeoSubject, siteUrl: string): SitemapExclusionReason | null {
  if (!isPublished(s)) return 'unpublished';
  if (s.contentEligible === false) return 'content-noindex';
  if (s.storedRobots !== undefined && !parseRobotsDirective(s.storedRobots).index) return 'stored-robots-noindex';
  if (s.editorNoindex) return 'editor-noindex';
  if (!isCanonicalSelf(s, siteUrl)) return 'canonical-away';
  if (s.sitemapType === false) return 'type-not-in-sitemap';
  return null;
}

export function isInSitemap(s: SeoSubject, siteUrl: string): boolean {
  return sitemapExclusionReason(s, siteUrl) === null;
}

/** Newest of the given timestamps, or undefined when none is known (never "now"). */
export function newestDate(...dates: ReadonlyArray<Date | null | undefined>): Date | undefined {
  let best: Date | undefined;
  for (const d of dates) if (d && !Number.isNaN(d.getTime()) && (!best || d > best)) best = d;
  return best;
}
