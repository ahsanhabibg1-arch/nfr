import { RawFinding, AuditScope } from './types';
import { SITE_URL } from '../seo';
import { classifyStoredCanonical, normalizeSameSiteCanonical } from '../seo/canonical';
import { sitemapExclusionReason, effectiveRobots, type SeoSubject } from '../seo/policy';
import { robotsToString } from '../seo/robots';
import { type RouteIndex, type RouteInfo, resolveRoute, classifyLink, safeNormalizePath, RENDERS_PUBLICLY } from '../seo/routeIndex';
import { Thresholds } from './rules';

/**
 * SEO analyzers (Batch 06 §6-§12). Pure functions over an Inventory built from
 * the database (no network, no fabrication). Each returns explainable findings
 * with concrete evidence. The orchestrator builds the Inventory and persists.
 */

export interface MediaInv {
  id: string; url: string; visibility: string; rightsConfirmed: boolean; storageProvider: string;
  altText: string | null; seoTitle: string | null; width: number | null; height: number | null;
}
export interface ArticleInv {
  id: string; slug: string; title: string; excerpt: string | null; status: string;
  categoryId: string | null; categoryName: string | null; authorName: string | null; createdById: string | null;
  heroImageUrl: string | null; publishedAt: Date | null; robots: string; seoTitle: string | null;
  metaDescription: string | null; canonicalUrl: string | null; ogImage: string | null;
  imageAltText: string | null; imageSeoTitle: string | null;
  headings: string[]; bodyWords: number; internalLinks: string[];
  disciplineSlugs: string[]; hubIds: string[]; eventIds: string[]; editions: { id: string; eventId: string }[];
  sourceCount: number; relatedIds: string[];
  /** Fixture slug hidden from public reads in production (Batch S6). */
  hiddenFixture?: boolean;
}
export interface Inventory {
  articles: ArticleInv[];
  articleStatusBySlug: Map<string, string>;
  /** Paths that render a public page (derived from `routes` when present). */
  validPaths: Set<string>;
  redirectSources: Map<string, string>;
  /** Batch S6: public route index (S4 evaluation + other valid routes). Optional for hand-built inventories. */
  routes?: RouteIndex;
  /** Batch S6: actual sitemap state from evaluateSitemap (S4 authority). */
  sitemap?: { urls: Set<string>; duplicates: { path: string; family: string }[] };
  hubs: { id: string; slug: string; title: string; articleCount: number }[];
  events: { id: string; slug: string; name: string; editionCount: number }[];
  editions: { id: string; slug: string; eventId: string; eventName: string; year: number | null; venueId: string | null; articleCount: number }[];
  disciplines: { id: string; slug: string; name: string }[];
  venues: { id: string; slug: string; name: string }[];
  categories: { id: string; slug: string; name: string }[];
  mediaByUrl: Map<string, MediaInv>;
  currentYear: number;
}

const norm = (p: string) => { let s = p.split('#')[0].split('?')[0].trim(); if (!s.startsWith('/')) return s; if (!s.endsWith('/')) s += '/'; return s; };

/**
 * Route outcome for a site path. Uses the S6 route index when the inventory has one;
 * otherwise falls back to the legacy validPaths/articleStatusBySlug data (hand-built inventories).
 */
export function routeFor(inv: Inventory, path: string): RouteInfo {
  if (inv.routes) return resolveRoute(inv.routes, path);
  const p = safeNormalizePath(path);
  if (!p) return { status: 'invalid', family: 'unknown', detail: 'malformed percent-encoding' };
  const art = /^\/articles\/([^/]+)\/$/.exec(p);
  if (art) {
    const st = inv.articleStatusBySlug.get(art[1]);
    if (st && st !== 'PUBLISHED') return { status: 'unpublished', family: 'article', detail: `article is ${st.toLowerCase()} (404)` };
    if (st === 'PUBLISHED') return { status: 'indexable', family: 'article' };
  }
  if (inv.redirectSources.has(p)) return { status: 'redirect', family: 'redirect', redirectTo: inv.redirectSources.get(p) };
  if (inv.validPaths.has(p)) return { status: 'indexable', family: 'known' };
  return { status: 'not-found', family: 'unknown', detail: 'no public route matches' };
}
const isPublished = (a: ArticleInv) => a.status === 'PUBLISHED';
const wordish = (s: string | null | undefined) => (s || '').trim();

// ---------------- Article metadata (§6) ----------------
export function analyzeArticles(inv: Inventory, t: Thresholds): RawFinding[] {
  const out: RawFinding[] = [];
  const seoTitleMap = new Map<string, string[]>();
  const metaDescMap = new Map<string, string[]>();
  for (const a of inv.articles) {
    const url = `/articles/${a.slug}/`;
    const F = (ruleCode: string, evidence: string, extra: Partial<RawFinding> = {}): RawFinding =>
      ({ ruleCode, entityType: 'article', entityId: a.id, articleId: a.id, affectedUrl: url, evidence, ...extra });
    if (!wordish(a.title)) out.push(F('ART_NO_HEADLINE', 'Article has no headline.'));
    if (!wordish(a.seoTitle)) out.push(F('ART_NO_SEO_TITLE', 'No SEO title set.'));
    else {
      const len = a.seoTitle!.trim().length;
      if (len < t.seoTitleMin || len > t.seoTitleMax) out.push(F('ART_TITLE_LEN', `SEO title is ${len} characters (guidance ${t.seoTitleMin}–${t.seoTitleMax}).`, { detail: { len } }));
      const key = a.seoTitle!.trim().toLowerCase();
      seoTitleMap.set(key, [...(seoTitleMap.get(key) || []), a.id]);
    }
    if (!wordish(a.metaDescription)) out.push(F('ART_NO_META_DESC', 'No meta description set.'));
    else {
      const len = a.metaDescription!.trim().length;
      if (len < t.metaDescMin || len > t.metaDescMax) out.push(F('ART_META_DESC_LEN', `Meta description is ${len} characters (guidance ${t.metaDescMin}–${t.metaDescMax}).`, { detail: { len } }));
      const key = a.metaDescription!.trim().toLowerCase();
      metaDescMap.set(key, [...(metaDescMap.get(key) || []), a.id]);
    }
    if (!wordish(a.excerpt)) out.push(F('ART_NO_EXCERPT', 'No editorial excerpt/summary.'));
    if (!a.categoryId) out.push(F('ART_NO_CATEGORY', 'No primary category assigned.'));
    if (a.bodyWords < t.minBodyWords) out.push(F('ART_EMPTY_BODY', `Body has ~${a.bodyWords} words (minimum guidance ${t.minBodyWords}).`, { detail: { words: a.bodyWords } }));
    if (a.headings.length === 0 && a.bodyWords > t.minBodyWords) out.push(F('ART_HEADING_HIERARCHY', 'Body has no section headings.'));
    const dupHead = a.headings.map((h) => h.trim().toLowerCase()).filter((h, i, arr) => h && arr.indexOf(h) !== i);
    if (dupHead.length) out.push(F('ART_DUP_HEADINGS', `Duplicate heading text: "${dupHead[0]}".`));
    if (isPublished(a) && a.publishedAt && a.publishedAt.getTime() > Date.now()) out.push(F('ART_FUTURE_PUBDATE', `Published article is dated in the future (${a.publishedAt.toISOString().slice(0, 10)}).`));
    if (isPublished(a) && !a.heroImageUrl) out.push(F('ART_NO_FEATURED_IMAGE', 'Published article has no featured image.'));
  }
  // Duplicate SEO title / meta description across articles.
  for (const [val, ids] of seoTitleMap) if (ids.length > 1) for (const id of ids)
    out.push({ ruleCode: 'ART_DUP_SEO_TITLE', entityType: 'article', entityId: id, articleId: id, affectedUrl: `/articles/${inv.articles.find((x) => x.id === id)?.slug}/`, evidence: `SEO title shared by ${ids.length} articles: "${val.slice(0, 60)}".`, discriminator: val });
  for (const [val, ids] of metaDescMap) if (ids.length > 1) for (const id of ids)
    out.push({ ruleCode: 'ART_DUP_META_DESC', entityType: 'article', entityId: id, articleId: id, affectedUrl: `/articles/${inv.articles.find((x) => x.id === id)?.slug}/`, evidence: `Meta description shared by ${ids.length} articles.`, discriminator: val });
  return out;
}

// ---------------- Editorial quality (§7) ----------------
export function analyzeEditorial(inv: Inventory): RawFinding[] {
  const out: RawFinding[] = [];
  for (const a of inv.articles) {
    if (a.status !== 'PUBLISHED' && a.status !== 'IN_REVIEW') continue;
    const url = `/articles/${a.slug}/`;
    const F = (ruleCode: string, evidence: string): RawFinding => ({ ruleCode, entityType: 'article', entityId: a.id, articleId: a.id, affectedUrl: url, evidence });
    if (a.sourceCount === 0) out.push(F('ED_NO_SOURCES', 'Article cites no sources.'));
    if (a.disciplineSlugs.length === 0 && a.hubIds.length === 0 && a.eventIds.length === 0 && a.editions.length === 0) out.push(F('ED_NO_RODEO_ENTITY', 'Article is not associated with any discipline, hub, event or edition.'));
    for (const ed of a.editions) {
      const edition = inv.editions.find((e) => e.id === ed.id);
      if (edition?.year && edition.year < inv.currentYear) { out.push(F('ED_STALE_EDITION', `References the ${edition.year} edition (a past year); verify currency.`)); break; }
    }
  }
  return out;
}

// ---------------- Technical SEO (§8, DB/static) ----------------
export function analyzeTechnical(inv: Inventory, siteUrl: string = SITE_URL): RawFinding[] {
  const out: RawFinding[] = [];
  for (const a of inv.articles) {
    if (!isPublished(a)) continue;
    const url = `/articles/${a.slug}/`;
    const F = (ruleCode: string, evidence: string): RawFinding => ({ ruleCode, entityType: 'article', entityId: a.id, articleId: a.id, affectedUrl: url, evidence });
    // Batch S5: same classifier as rendering/sitemap (lib/seo/canonical.ts), on SITE_URL —
    // no hard-coded host. Stored production URLs count as this site in every environment.
    const canon = classifyStoredCanonical(a.canonicalUrl, url, siteUrl);
    if (canon === 'absent') out.push(F('TECH_NO_CANONICAL', 'Published article has no canonical URL recorded.'));
    else if (canon === 'same-site-other') out.push(F('TECH_CANONICAL_MISMATCH', `Canonical "${a.canonicalUrl}" points to another page; the page renders it as its canonical (canonical-away, excluded from the sitemap).`));
    else if (canon === 'ignored-off-site') out.push(F('TECH_CANONICAL_MISMATCH', `Stored canonical "${a.canonicalUrl}" is off-site and is ignored; the page renders its own URL (${url}).`));
    else if (canon === 'ignored-malformed') out.push(F('TECH_CANONICAL_MISMATCH', `Stored canonical "${a.canonicalUrl}" is malformed and is ignored; the page renders its own URL (${url}).`));
    if (/noindex/i.test(a.robots)) out.push(F('TECH_PUBLISHED_NOINDEX', `Published article robots = "${a.robots}".`));
    // Batch S6: sitemap consistency against the S4 authority. The audit's own article data is
    // evaluated with the S4 policy and compared with the ACTUAL evaluateSitemap output, both
    // ways. Correctly excluded articles (noindex, canonical-away, hidden) produce no finding.
    if (inv.sitemap) {
      const subject: SeoSubject = {
        path: url, published: !a.hiddenFixture, storedRobots: a.robots,
        canonical: normalizeSameSiteCanonical(a.canonicalUrl, siteUrl),
      };
      const reason = sitemapExclusionReason(subject, siteUrl);
      const listed = inv.sitemap.urls.has(url);
      const state = `robots ${robotsToString(effectiveRobots(subject))}; canonical ${canon}; expected ${reason ? `excluded (${reason})` : 'listed'}; actual ${listed ? 'listed' : 'not listed'}`;
      if (!reason && !listed) out.push({ ...F('TECH_SITEMAP_EXCLUDED', `Published, indexable, self-canonical article is missing from the sitemap (${state}).`), detail: { contentType: 'article', expected: 'listed', actual: 'not listed', reason: null } });
      if (reason && listed) out.push({ ...F('TECH_SITEMAP_EXCLUDED', `Article is listed in the sitemap but the page policy excludes it (${state}).`), detail: { contentType: 'article', expected: 'excluded', actual: 'listed', reason } });
    }
  }
  // Two sitemap candidates resolving to one URL (S4 keeps the first; the other is shadowed).
  for (const d of inv.sitemap?.duplicates ?? []) {
    out.push({ ruleCode: 'TECH_SITEMAP_EXCLUDED', entityType: 'route', entityId: d.path, affectedUrl: d.path, discriminator: `duplicate:${d.family}`, evidence: `Duplicate sitemap URL ${d.path}: a ${d.family} candidate resolves to a URL already listed by another entity (only the first is listed).`, detail: { contentType: d.family, reason: 'duplicate-url' } });
  }
  // Redirect loops/chains + unknown targets.
  for (const [source, target] of inv.redirectSources) {
    const tgt = norm(target);
    const F = (ruleCode: string, evidence: string): RawFinding => ({ ruleCode, entityType: 'route', entityId: source, affectedUrl: source, evidence });
    if (inv.redirectSources.has(tgt) || inv.redirectSources.has(target)) out.push(F('TECH_REDIRECT_LOOP', `Redirect ${source} → ${target}, whose target is itself a redirect source.`));
    else if (tgt.startsWith('/') && !RENDERS_PUBLICLY.has(routeFor(inv, tgt).status)) out.push(F('TECH_REDIRECT_TARGET_UNKNOWN', `Redirect ${source} → ${target} does not resolve to a public page (${routeFor(inv, tgt).detail ?? routeFor(inv, tgt).status}).`));
  }
  return out;
}

// ---------------- Structured data (§9) ----------------
export function analyzeStructuredData(inv: Inventory, siteUrl: string = SITE_URL): RawFinding[] {
  const out: RawFinding[] = [];
  for (const a of inv.articles) {
    if (!isPublished(a)) continue;
    const url = `/articles/${a.slug}/`;
    const F = (ruleCode: string, evidence: string): RawFinding => ({ ruleCode, entityType: 'structured_data', entityId: a.id, articleId: a.id, affectedUrl: url, evidence });
    if (!wordish(a.title)) out.push(F('SD_ARTICLE_NO_HEADLINE', 'Article JSON-LD would have no headline (no title).'));
    if (!a.publishedAt) out.push(F('SD_ARTICLE_NO_DATE', 'Article JSON-LD would have no datePublished.'));
    if (!a.heroImageUrl) out.push(F('SD_ARTICLE_NO_IMAGE', 'Article JSON-LD has no image.'));
    // JSON-LD mainEntityOfPage is always the article's own URL; it disagrees with the
    // rendered canonical only when a same-site canonical points elsewhere (Batch S5).
    if (classifyStoredCanonical(a.canonicalUrl, url, siteUrl) === 'same-site-other') out.push(F('SD_CANONICAL_MISMATCH', 'Structured-data URL would not match the canonical URL.'));
  }
  return out;
}

// ---------------- Internal links (§10) ----------------
export function analyzeInternalLinks(inv: Inventory, siteUrl: string = SITE_URL): RawFinding[] {
  const out: RawFinding[] = [];
  const inbound = new Map<string, number>(); // articleId -> inbound count
  const slugToId = new Map<string, string>();
  for (const a of inv.articles) slugToId.set(a.slug, a.id);
  const bump = (id: string) => inbound.set(id, (inbound.get(id) || 0) + 1);
  for (const a of inv.articles) for (const rid of a.relatedIds) if (slugToId.has(inv.articles.find((x) => x.id === rid)?.slug || '')) bump(rid);

  for (const a of inv.articles) {
    const url = `/articles/${a.slug}/`;
    const F = (ruleCode: string, evidence: string, target?: string): RawFinding =>
      ({ ruleCode, entityType: 'article', entityId: a.id, articleId: a.id, affectedUrl: url, evidence, discriminator: target, detail: target ? { target } : undefined });
    // Batch S6: classify each link (S5 same-site hosts — no network), then resolve internal
    // paths against the route index. Valid noindex / canonical-away / non-sitemap pages are
    // valid destinations; only genuinely missing, non-public or malformed targets are broken.
    for (const raw of a.internalLinks) {
      const c = classifyLink(raw, siteUrl);
      if (c.kind === 'external' || c.kind === 'non-web') continue; // not verified (no network requests)
      if (c.kind === 'unsafe') { out.push(F('LINK_BROKEN', `Unsafe link "${raw}" (${c.scheme}: scheme is rendered as "#").`, raw)); continue; }
      if (c.kind === 'invalid') { out.push(F('LINK_BROKEN', `Invalid link "${raw}": ${c.reason}.`, raw)); continue; }
      const p = c.path;
      const r = routeFor(inv, p);
      if (RENDERS_PUBLICLY.has(r.status)) {
        const m = /^\/articles\/([^/]+)\/$/.exec(p);
        if (m && slugToId.has(m[1])) bump(slugToId.get(m[1])!);
      } else if (r.status === 'redirect') {
        out.push(F('LINK_REDIRECTED', `Links to redirect source ${p} → ${r.redirectTo}.`, p));
      } else if (r.status === 'unpublished') {
        out.push(F('LINK_TO_UNPUBLISHED', `Internal link to a non-public page: ${p} (${r.detail}).`, p));
      } else if (r.status !== 'protected') {
        out.push(F('LINK_BROKEN', `Internal link to ${p} does not resolve (${r.detail ?? r.status}).`, p));
      }
    }
  }
  // Orphans (published articles with no inbound links/relations).
  for (const a of inv.articles) if (isPublished(a) && !(inbound.get(a.id))) out.push({ ruleCode: 'LINK_ORPHAN', entityType: 'article', entityId: a.id, articleId: a.id, affectedUrl: `/articles/${a.slug}/`, evidence: 'Published article has no inbound internal links or related-article relationships.' });
  // Opportunities: one strongest candidate per published article (shared discipline, not already related).
  for (const a of inv.articles) {
    if (!isPublished(a) || a.disciplineSlugs.length === 0) continue;
    const cand = inv.articles.find((b) => b.id !== a.id && isPublished(b) && !a.relatedIds.includes(b.id) && b.disciplineSlugs.some((d) => a.disciplineSlugs.includes(d)));
    if (cand) out.push({ ruleCode: 'LINK_OPPORTUNITY', entityType: 'article', entityId: a.id, articleId: a.id, affectedUrl: `/articles/${a.slug}/`, evidence: `Shares a discipline with "${cand.title}" but is not linked to it.`, recommendation: `Consider linking to /articles/${cand.slug}/ where contextually relevant.`, discriminator: cand.id, detail: { target: `/articles/${cand.slug}/`, reason: 'shared discipline' } });
  }
  return out;
}

// ---------------- Rodeo entity (§11) ----------------
export function analyzeRodeoEntities(inv: Inventory): RawFinding[] {
  const out: RawFinding[] = [];
  // Duplicate slugs across all rodeo entity types.
  const slugOwners = new Map<string, string[]>();
  const add = (slug: string, who: string) => slugOwners.set(slug, [...(slugOwners.get(slug) || []), who]);
  for (const h of inv.hubs) add(h.slug, `hub:${h.id}`);
  for (const e of inv.events) add(e.slug, `event:${e.id}`);
  for (const ed of inv.editions) add(ed.slug, `edition:${ed.id}`);
  for (const d of inv.disciplines) add(d.slug, `discipline:${d.id}`);
  for (const v of inv.venues) add(v.slug, `venue:${v.id}`);
  for (const [slug, owners] of slugOwners) if (owners.length > 1) out.push({ ruleCode: 'RODEO_DUP_SLUG', entityType: 'rodeo_entity', entityId: slug, evidence: `Slug "${slug}" is used by ${owners.length} entities: ${owners.join(', ')}.`, discriminator: slug });
  for (const e of inv.events) if (e.editionCount === 0) out.push({ ruleCode: 'RODEO_EVENT_NO_EDITION', entityType: 'rodeo_event', entityId: e.id, evidence: `Recurring event "${e.name}" has no editions.` });
  for (const ed of inv.editions) {
    if (ed.articleCount === 0) out.push({ ruleCode: 'RODEO_ORPHAN_EDITION', entityType: 'rodeo_edition', entityId: ed.id, evidence: `Edition "${ed.slug}" of ${ed.eventName} has no articles.` });
    if (!ed.venueId && !ed.year) out.push({ ruleCode: 'RODEO_EDITION_NO_VENUE_DATE', entityType: 'rodeo_edition', entityId: ed.id, evidence: `Edition "${ed.slug}" of ${ed.eventName} has no venue or year.` });
  }
  // Article edition/event mismatch: article linked to an edition whose event isn't among the article's events.
  const editionEvent = new Map(inv.editions.map((e) => [e.id, e.eventId]));
  for (const a of inv.articles) for (const ed of a.editions) {
    const parent = editionEvent.get(ed.id);
    if (parent && a.eventIds.length > 0 && !a.eventIds.includes(parent)) out.push({ ruleCode: 'RODEO_ARTICLE_EDITION_MISMATCH', entityType: 'article', entityId: a.id, articleId: a.id, affectedUrl: `/articles/${a.slug}/`, evidence: `Linked to an edition whose parent event is not among the article's linked events.`, discriminator: ed.id });
  }
  return out;
}

// ---------------- Image SEO & accessibility (§12) ----------------
export function analyzeImages(inv: Inventory): RawFinding[] {
  const out: RawFinding[] = [];
  for (const a of inv.articles) {
    if (!isPublished(a) || !a.heroImageUrl) continue;
    const url = `/articles/${a.slug}/`;
    const F = (ruleCode: string, evidence: string): RawFinding => ({ ruleCode, entityType: 'article', entityId: a.id, articleId: a.id, affectedUrl: url, evidence });
    const media = inv.mediaByUrl.get(a.heroImageUrl);
    const assetAlt = media?.altText || '';
    if (!wordish(a.imageAltText) && !wordish(assetAlt)) out.push(F('IMG_NO_ALT', 'Featured image has no ALT text (article-level or asset-level).'));
    if (!wordish(a.imageSeoTitle) && !wordish(media?.seoTitle)) out.push(F('IMG_GENERIC_SEO_TITLE', 'Featured image has no image SEO title.'));
    // Managed media checks (DAM-served URLs only).
    if (a.heroImageUrl.startsWith('/api/media/')) {
      if (!media) out.push(F('IMG_BROKEN_REF', `Featured image ${a.heroImageUrl} does not resolve to a media asset.`));
      else {
        if (media.visibility !== 'PUBLIC') out.push(F('IMG_PRIVATE_ON_PUBLISHED', `Featured image is ${media.visibility} and would 404 for readers.`));
        if (!media.rightsConfirmed && media.storageProvider !== 'legacy-local') out.push(F('IMG_RIGHTS_UNCONFIRMED', 'Featured image usage rights are unconfirmed.'));
        if (!media.width || !media.height) out.push(F('IMG_NO_DIMENSIONS', 'Featured image has no recorded dimensions.'));
      }
    }
  }
  return out;
}

export function runAnalyzers(inv: Inventory, t: Thresholds, scope: AuditScope): RawFinding[] {
  if (scope.kind === 'article') {
    // Single-article scope: only the per-article analyzers (duplicates still need the full set, but we bound to the one article's findings).
    const one = inv.articles;
    return [...analyzeArticles({ ...inv, articles: one }, t), ...analyzeEditorial(inv), ...analyzeTechnical(inv), ...analyzeStructuredData(inv), ...analyzeInternalLinks(inv), ...analyzeImages(inv)]
      .filter((f) => f.articleId === scope.articleId);
  }
  if (scope.kind === 'rodeo') return analyzeRodeoEntities(inv);
  if (scope.kind === 'technical') return [...analyzeTechnical(inv), ...analyzeStructuredData(inv)];
  return [
    ...analyzeArticles(inv, t), ...analyzeEditorial(inv), ...analyzeTechnical(inv),
    ...analyzeStructuredData(inv), ...analyzeInternalLinks(inv), ...analyzeRodeoEntities(inv), ...analyzeImages(inv),
  ];
}
