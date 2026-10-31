import { RawFinding, AuditScope } from './types';
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
}
export interface Inventory {
  articles: ArticleInv[];
  articleStatusBySlug: Map<string, string>;
  validPaths: Set<string>;
  redirectSources: Map<string, string>;
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
export function analyzeTechnical(inv: Inventory): RawFinding[] {
  const out: RawFinding[] = [];
  for (const a of inv.articles) {
    if (!isPublished(a)) continue;
    const url = `/articles/${a.slug}/`;
    const F = (ruleCode: string, evidence: string): RawFinding => ({ ruleCode, entityType: 'article', entityId: a.id, articleId: a.id, affectedUrl: url, evidence });
    const expected = `https://nfrguide.com/articles/${a.slug}/`;
    if (!wordish(a.canonicalUrl)) out.push(F('TECH_NO_CANONICAL', 'Published article has no canonical URL recorded.'));
    else if (a.canonicalUrl!.replace(/\/+$/, '/') !== expected) out.push(F('TECH_CANONICAL_MISMATCH', `Canonical "${a.canonicalUrl}" ≠ expected "${expected}".`));
    if (/noindex/i.test(a.robots)) out.push(F('TECH_PUBLISHED_NOINDEX', `Published article robots = "${a.robots}".`));
    if (!/noindex/i.test(a.robots) && !inv.validPaths.has(url)) out.push(F('TECH_SITEMAP_EXCLUDED', 'Published indexable article is not in the sitemap inventory.'));
  }
  // Redirect loops/chains + unknown targets.
  for (const [source, target] of inv.redirectSources) {
    const tgt = norm(target);
    const F = (ruleCode: string, evidence: string): RawFinding => ({ ruleCode, entityType: 'route', entityId: source, affectedUrl: source, evidence });
    if (inv.redirectSources.has(tgt) || inv.redirectSources.has(target)) out.push(F('TECH_REDIRECT_LOOP', `Redirect ${source} → ${target}, whose target is itself a redirect source.`));
    else if (tgt.startsWith('/') && !inv.validPaths.has(tgt)) out.push(F('TECH_REDIRECT_TARGET_UNKNOWN', `Redirect ${source} → ${target} does not resolve to a known route/article.`));
  }
  return out;
}

// ---------------- Structured data (§9) ----------------
export function analyzeStructuredData(inv: Inventory): RawFinding[] {
  const out: RawFinding[] = [];
  for (const a of inv.articles) {
    if (!isPublished(a)) continue;
    const url = `/articles/${a.slug}/`;
    const F = (ruleCode: string, evidence: string): RawFinding => ({ ruleCode, entityType: 'structured_data', entityId: a.id, articleId: a.id, affectedUrl: url, evidence });
    if (!wordish(a.title)) out.push(F('SD_ARTICLE_NO_HEADLINE', 'Article JSON-LD would have no headline (no title).'));
    if (!a.publishedAt) out.push(F('SD_ARTICLE_NO_DATE', 'Article JSON-LD would have no datePublished.'));
    if (!a.heroImageUrl) out.push(F('SD_ARTICLE_NO_IMAGE', 'Article JSON-LD has no image.'));
    const expected = `https://nfrguide.com/articles/${a.slug}/`;
    if (a.canonicalUrl && a.canonicalUrl.replace(/\/+$/, '/') !== expected) out.push(F('SD_CANONICAL_MISMATCH', 'Structured-data URL would not match the canonical URL.'));
  }
  return out;
}

// ---------------- Internal links (§10) ----------------
export function analyzeInternalLinks(inv: Inventory): RawFinding[] {
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
    for (const link of a.internalLinks) {
      const p = norm(link);
      // article link?
      const m = p.match(/^\/articles\/([a-z0-9-]+)\/$/i);
      if (inv.redirectSources.has(p)) { out.push(F('LINK_REDIRECTED', `Links to redirect source ${p} → ${inv.redirectSources.get(p)}.`, p)); continue; }
      if (m) {
        const st = inv.articleStatusBySlug.get(m[1]);
        if (!st) out.push(F('LINK_BROKEN', `Internal link to a non-existent article: ${p}.`, p));
        else if (st !== 'PUBLISHED') out.push(F('LINK_TO_UNPUBLISHED', `Internal link to a ${st.toLowerCase()} (non-public) article: ${p}.`, p));
        else bump(slugToId.get(m[1])!);
      } else if (p.startsWith('/') && !inv.validPaths.has(p)) {
        out.push(F('LINK_BROKEN', `Internal link to a path that does not resolve: ${p}.`, p));
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
