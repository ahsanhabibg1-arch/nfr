import { SeoRuleDef } from './types';

/**
 * SEO rule registry (Batch 06 §3). Deterministic, explainable rules with stable
 * codes. Severity levels are an INTERNAL editorial diagnostic (not a Google
 * score). Length checks are configurable guidance, not Google indexing rules.
 * See SEO_RULE_REGISTRY.md.
 */
export const SEO_ENGINE_VERSION = '1.0.0';

/** Configurable editorial thresholds (overridable via SeoConfig, §15). */
export const DEFAULT_THRESHOLDS = {
  seoTitleMin: 20,
  seoTitleMax: 65,
  metaDescMin: 70,
  metaDescMax: 165,
  minBodyWords: 60,
};
export type Thresholds = typeof DEFAULT_THRESHOLDS;

export const RULES: SeoRuleDef[] = [
  // ---------------- Article metadata (content) ----------------
  { code: 'ART_NO_HEADLINE', title: 'Missing headline', category: 'content', severity: 'CRITICAL', kind: 'DEFECT', description: 'The article has no headline/title.', recommendation: 'Add a clear, descriptive headline.' },
  { code: 'ART_NO_SEO_TITLE', title: 'Missing SEO title', category: 'content', severity: 'HIGH', kind: 'DEFECT', description: 'No SEO title is set; search engines fall back to the headline.', recommendation: 'Add an SEO title in the editor (field 5).' },
  { code: 'ART_NO_META_DESC', title: 'Missing meta description', category: 'content', severity: 'HIGH', kind: 'DEFECT', description: 'No meta description is set.', recommendation: 'Write a concise meta description (field 6).' },
  { code: 'ART_TITLE_LEN', title: 'SEO title length outside guidance', category: 'content', severity: 'LOW', kind: 'RECOMMENDATION', description: 'SEO title length is outside the configured guidance range.', recommendation: 'Aim for the configured length range (guidance only).' },
  { code: 'ART_META_DESC_LEN', title: 'Meta description length outside guidance', category: 'content', severity: 'LOW', kind: 'RECOMMENDATION', description: 'Meta description length is outside the configured guidance range.', recommendation: 'Aim for the configured length range (guidance only).' },
  { code: 'ART_DUP_SEO_TITLE', title: 'Duplicate SEO title', category: 'content', severity: 'MEDIUM', kind: 'DEFECT', description: 'Two or more articles share the same SEO title.', recommendation: 'Make each article’s SEO title unique.' },
  { code: 'ART_DUP_META_DESC', title: 'Duplicate meta description', category: 'content', severity: 'MEDIUM', kind: 'DEFECT', description: 'Two or more articles share the same meta description.', recommendation: 'Write a distinct meta description per article.' },
  { code: 'ART_NO_EXCERPT', title: 'Missing editorial excerpt', category: 'content', severity: 'MEDIUM', kind: 'DEFECT', description: 'The article has no excerpt/summary.', recommendation: 'Add an editorial excerpt (field 3).' },
  { code: 'ART_NO_CATEGORY', title: 'Missing primary category', category: 'content', severity: 'HIGH', kind: 'DEFECT', description: 'The article is not assigned to a primary section/category.', recommendation: 'Assign the article to a category.' },
  { code: 'ART_EMPTY_BODY', title: 'Empty article body', category: 'content', severity: 'HIGH', kind: 'DEFECT', description: 'The article body has little or no text.', recommendation: 'Add article body content.' },
  { code: 'ART_HEADING_HIERARCHY', title: 'Heading hierarchy issue', category: 'content', severity: 'LOW', kind: 'RECOMMENDATION', description: 'The body has no section headings (or they skip levels).', recommendation: 'Add H2 section headings to structure the article.' },
  { code: 'ART_DUP_HEADINGS', title: 'Duplicate heading text', category: 'content', severity: 'LOW', kind: 'RECOMMENDATION', description: 'Multiple headings share identical text.', recommendation: 'Differentiate repeated heading text.' },
  { code: 'ART_FUTURE_PUBDATE', title: 'Future-dated publication', category: 'content', severity: 'MEDIUM', kind: 'DEFECT', description: 'A published article has a publication date in the future.', recommendation: 'Correct the publication date or schedule it instead.' },
  { code: 'ART_NO_FEATURED_IMAGE', title: 'No featured image', category: 'content', severity: 'LOW', kind: 'RECOMMENDATION', description: 'The article has no featured image (editorially expected for most pieces).', recommendation: 'Add a featured image from the Media Library.' },

  // ---------------- Editorial quality (editorial) ----------------
  { code: 'ED_NO_SOURCES', title: 'No source references', category: 'editorial', severity: 'MEDIUM', kind: 'RECOMMENDATION', description: 'The article cites no sources; factual claims may need attribution.', recommendation: 'Attach source references where claims require them.' },
  { code: 'ED_NO_RODEO_ENTITY', title: 'No rodeo entity association', category: 'editorial', severity: 'LOW', kind: 'RECOMMENDATION', description: 'The article is not linked to any discipline, hub, event or edition.', recommendation: 'Associate the article with the relevant rodeo entity where applicable.' },
  { code: 'ED_STALE_EDITION', title: 'Possibly stale edition reference', category: 'editorial', severity: 'LOW', kind: 'RECOMMENDATION', description: 'The article references an edition from a past year; verify it is still current.', recommendation: 'Confirm the edition year is correct or update to the current edition.' },

  // ---------------- Technical SEO (technical) ----------------
  { code: 'TECH_NO_CANONICAL', title: 'Missing canonical URL', category: 'technical', severity: 'HIGH', kind: 'DEFECT', description: 'A published article has no canonical URL recorded.', recommendation: 'Ensure the article SEO record has a canonical URL.' },
  { code: 'TECH_CANONICAL_MISMATCH', title: 'Canonical URL mismatch', category: 'technical', severity: 'MEDIUM', kind: 'DEFECT', description: 'The stored canonical URL does not match the computed canonical path.', recommendation: 'Align the canonical URL with the article’s canonical route.' },
  { code: 'TECH_PUBLISHED_NOINDEX', title: 'Published page set to noindex', category: 'technical', severity: 'HIGH', kind: 'DEFECT', description: 'A published article’s robots directive contains noindex.', recommendation: 'Set robots to index for published content (unless intentionally hidden).' },
  { code: 'TECH_SITEMAP_EXCLUDED', title: 'Sitemap inconsistency', category: 'technical', severity: 'MEDIUM', kind: 'DEFECT', description: 'The sitemap disagrees with the page policy (lib/seo/policy.ts): a published, indexable, self-canonical page is missing, an excluded page is listed, or two entities resolve to one sitemap URL. Correctly excluded pages (noindex, canonical-away, unpublished) are not reported.', recommendation: 'Check the content record and its SEO settings; the sitemap and the page must agree.' },
  { code: 'TECH_REDIRECT_LOOP', title: 'Redirect loop / chain', category: 'technical', severity: 'HIGH', kind: 'DEFECT', description: 'A redirect target is itself a redirect source (loop or multi-hop chain).', recommendation: 'Point the redirect directly at the final destination.' },
  { code: 'TECH_REDIRECT_TARGET_UNKNOWN', title: 'Redirect target not found', category: 'technical', severity: 'MEDIUM', kind: 'DEFECT', description: 'A redirect points to a path that does not resolve to a known route or published article.', recommendation: 'Update the redirect to a valid destination.' },

  // ---------------- Structured data (structured_data) ----------------
  { code: 'SD_ARTICLE_NO_HEADLINE', title: 'Article schema missing headline', category: 'structured_data', severity: 'HIGH', kind: 'DEFECT', description: 'The generated Article JSON-LD would have no headline.', recommendation: 'Ensure the article has a title (drives schema headline).' },
  { code: 'SD_ARTICLE_NO_DATE', title: 'Article schema missing datePublished', category: 'structured_data', severity: 'MEDIUM', kind: 'DEFECT', description: 'The generated Article JSON-LD would have no datePublished.', recommendation: 'Set a valid publication date.' },
  { code: 'SD_ARTICLE_NO_IMAGE', title: 'Article schema missing image', category: 'structured_data', severity: 'LOW', kind: 'RECOMMENDATION', description: 'The generated Article JSON-LD has no image.', recommendation: 'Add a featured image to enrich the Article schema.' },
  { code: 'SD_CANONICAL_MISMATCH', title: 'Schema URL vs canonical mismatch', category: 'structured_data', severity: 'MEDIUM', kind: 'DEFECT', description: 'The JSON-LD mainEntity/url would not match the canonical URL.', recommendation: 'Align structured-data URL with the canonical.' },

  // ---------------- Internal links (internal_link) ----------------
  { code: 'LINK_BROKEN', title: 'Broken internal link', category: 'internal_link', severity: 'HIGH', kind: 'DEFECT', description: 'An internal link in the article body targets a path that does not resolve.', recommendation: 'Fix or remove the broken internal link.' },
  { code: 'LINK_TO_UNPUBLISHED', title: 'Link to unpublished content', category: 'internal_link', severity: 'MEDIUM', kind: 'DEFECT', description: 'An internal link points to a draft/archived (non-public) article.', recommendation: 'Link to published content or remove the link.' },
  { code: 'LINK_REDIRECTED', title: 'Link points to a redirect', category: 'internal_link', severity: 'LOW', kind: 'RECOMMENDATION', description: 'An internal link targets a known redirect source instead of the final URL.', recommendation: 'Update the link to the redirect’s destination.' },
  { code: 'LINK_ORPHAN', title: 'Orphan article', category: 'internal_link', severity: 'MEDIUM', kind: 'RECOMMENDATION', description: 'A published article has no inbound internal links or related-article relationships.', recommendation: 'Add contextual internal links from related articles.' },
  { code: 'LINK_OPPORTUNITY', title: 'Related-link opportunity', category: 'internal_link', severity: 'LOW', kind: 'OPPORTUNITY', description: 'Two published articles share a discipline/event/category but are not linked.', recommendation: 'Consider adding a contextual internal link (editor approval required).' },

  // ---------------- Rodeo entity (rodeo_entity) ----------------
  { code: 'RODEO_DUP_SLUG', title: 'Duplicate entity slug', category: 'rodeo_entity', severity: 'HIGH', kind: 'DEFECT', description: 'The same slug is used by more than one rodeo entity.', recommendation: 'Make each entity slug unique to avoid URL collisions.' },
  { code: 'RODEO_EVENT_NO_EDITION', title: 'Recurring event has no editions', category: 'rodeo_entity', severity: 'LOW', kind: 'RECOMMENDATION', description: 'A recurring event has no annual editions recorded.', recommendation: 'Add the relevant edition(s) for this event.' },
  { code: 'RODEO_ORPHAN_EDITION', title: 'Edition has no articles', category: 'rodeo_entity', severity: 'LOW', kind: 'RECOMMENDATION', description: 'An annual edition is not referenced by any article.', recommendation: 'Link coverage to this edition, or verify it should exist.' },
  { code: 'RODEO_ARTICLE_EDITION_MISMATCH', title: 'Article edition/event mismatch', category: 'rodeo_entity', severity: 'MEDIUM', kind: 'DEFECT', description: 'An article is linked to an edition whose parent event is not among the article’s linked events.', recommendation: 'Correct the event/edition association (do not merge events with editions).' },
  { code: 'RODEO_EDITION_NO_VENUE_DATE', title: 'Edition missing venue/date', category: 'rodeo_entity', severity: 'LOW', kind: 'RECOMMENDATION', description: 'An edition has no venue or year recorded.', recommendation: 'Add verified venue/date metadata (never fabricate it).' },

  // ---------------- Image SEO & accessibility (image) ----------------
  { code: 'IMG_NO_ALT', title: 'Featured image missing ALT text', category: 'image', severity: 'HIGH', kind: 'DEFECT', description: 'A published article’s featured image has no ALT text (article-level or asset-level).', recommendation: 'Add descriptive ALT text (field 8) or on the asset.' },
  { code: 'IMG_GENERIC_SEO_TITLE', title: 'Missing image SEO title', category: 'image', severity: 'LOW', kind: 'RECOMMENDATION', description: 'The featured image has no image SEO title.', recommendation: 'Add an image SEO title (field 7 / asset metadata).' },
  { code: 'IMG_BROKEN_REF', title: 'Broken media reference', category: 'image', severity: 'HIGH', kind: 'DEFECT', description: 'The article references a managed media URL that does not resolve to an asset.', recommendation: 'Re-select a valid featured image.' },
  { code: 'IMG_PRIVATE_ON_PUBLISHED', title: 'Private media on published page', category: 'image', severity: 'CRITICAL', kind: 'DEFECT', description: 'A published article’s featured image is DRAFT/not-public and would 404 for readers.', recommendation: 'Publish/confirm the asset so it is publicly servable.' },
  { code: 'IMG_RIGHTS_UNCONFIRMED', title: 'Unconfirmed media rights on published page', category: 'image', severity: 'HIGH', kind: 'DEFECT', description: 'A published article uses a managed image whose usage rights are unconfirmed.', recommendation: 'Confirm the asset’s usage rights in the Media Library.' },
  { code: 'IMG_NO_DIMENSIONS', title: 'Image missing dimensions', category: 'image', severity: 'LOW', kind: 'RECOMMENDATION', description: 'A media asset has no recorded width/height.', recommendation: 'Re-process the asset to record dimensions.' },
];

export const RULE_BY_CODE: Record<string, SeoRuleDef> = Object.fromEntries(RULES.map((r) => [r.code, r]));
