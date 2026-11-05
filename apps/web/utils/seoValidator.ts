import { Article } from '../types';
import { SEOGroup } from '../types/admin';

export type ValidationSeverity = 'blocker' | 'compliance' | 'warning' | 'notice';

/** Image rights statuses that clear the publish gate. Anything else (incl. unknown values) blocks. */
export const RESOLVED_IMAGE_RIGHTS = ['Staff Photo', 'Editorial Pool', 'PRCA Archive', 'Licensed Creative'] as const;

/**
 * Human-facing grouping for the editor SEO Assistant panel (Batch 25). These map the
 * engine's existing rules onto reader-meaningful categories — they do NOT add new checks.
 */
export type DisplayCategory =
  | 'Editorial Quality'
  | 'SEO Metadata'
  | 'Content Structure'
  | 'Images & Accessibility'
  | 'Internal & External Links'
  | 'Entity Relationships'
  | 'Structured Data'
  | 'Rights, Safety & Compliance'
  | 'Publication Readiness';

export const DISPLAY_CATEGORIES: DisplayCategory[] = [
  'Publication Readiness',
  'Editorial Quality',
  'SEO Metadata',
  'Content Structure',
  'Images & Accessibility',
  'Internal & External Links',
  'Entity Relationships',
  'Structured Data',
  'Rights, Safety & Compliance',
];

export interface ValidationFinding {
  id: string;
  group: SEOGroup;
  severity: ValidationSeverity;
  rule: string;
  field: string;
  message: string;
  remediation: string;
  passed: boolean;
  /** Batch 25 presentation metadata (derived from the rule, never fabricated). */
  displayCategory: DisplayCategory;
  /** DOM id the editor can scroll to / focus for "Go to Field" (empty when none applies). */
  fieldAnchor: string;
  /** Human label for the editorial field/section this check concerns. */
  fieldLabel: string;
  /** True when a failure of this check blocks publication (blocker | compliance). */
  blocksPublication: boolean;
  /** False for conditionally-applicable checks that did not run (e.g. schedule time when not scheduled). */
  evaluated: boolean;
}

export interface ArticleValidationReport {
  /** Every check, evaluated or not — the source for the detailed SEO Assistant panel. */
  findings: ValidationFinding[];
  blockers: ValidationFinding[];
  compliance: ValidationFinding[];
  warnings: ValidationFinding[];
  notices: ValidationFinding[];
  /** Conditionally-applicable checks that did not run for this article/state. */
  notEvaluated: ValidationFinding[];
  canPublish: boolean;
  score: number;
  totalChecks: number;
  passedChecks: number;
}

/** Rule id → human field label + DOM anchor for Go-to-Field (uses real editor field ids). */
const FIELD_META: Record<string, { category: DisplayCategory; anchor: string; label: string }> = {
  'val-headline-req': { category: 'Editorial Quality', anchor: 'field-01-headline', label: 'Field 01 — Main Headline (H1)' },
  'val-excerpt-req': { category: 'Editorial Quality', anchor: 'field-03-excerpt', label: 'Field 03 — Editorial Excerpt' },
  'val-body-req': { category: 'Content Structure', anchor: 'field-04-body', label: 'Field 04 — Article Body' },
  'val-slug-format': { category: 'SEO Metadata', anchor: 'editor-slug', label: 'URL Slug' },
  'val-image-rights': { category: 'Rights, Safety & Compliance', anchor: 'editor-rights-status', label: 'Featured Image Usage Rights' },
  'val-alt-required': { category: 'Images & Accessibility', anchor: 'field-08-imagealt', label: 'Field 08 — Image ALT Text' },
  'val-monetization-disclosure': { category: 'Rights, Safety & Compliance', anchor: 'editor-disclosure', label: 'Commercial Disclosure' },
  'val-scheduled-time': { category: 'Publication Readiness', anchor: 'editor-workflow-state', label: 'Workflow / Scheduled Time' },
  'val-seo-title-len': { category: 'SEO Metadata', anchor: 'field-05-seotitle', label: 'Field 05 — SEO Title' },
  'val-meta-desc-len': { category: 'SEO Metadata', anchor: 'field-06-metadesc', label: 'Field 06 — Meta Description' },
  'val-image-seo-title': { category: 'Images & Accessibility', anchor: 'field-07-imageseotitle', label: 'Field 07 — Image SEO Title' },
  'val-heading-hierarchy': { category: 'Content Structure', anchor: 'field-04-body', label: 'Field 04 — Article Body' },
  'val-ai-readiness': { category: 'Content Structure', anchor: 'field-04-body', label: 'Field 04 — Article Body' },
  'val-entity-association': { category: 'Entity Relationships', anchor: 'editor-relationships', label: 'Rodeo Relationships' },
  'val-sources-provenance': { category: 'Structured Data', anchor: 'editor-sources', label: 'Sources & References' },
  'val-internal-links': { category: 'Internal & External Links', anchor: 'editor-relationships', label: 'Editorial Relationships' },
  'val-canonical-redirects': { category: 'SEO Metadata', anchor: 'field-06-metadesc', label: 'Canonical URL' },
};

type RawFinding = Omit<ValidationFinding, 'displayCategory' | 'fieldAnchor' | 'fieldLabel' | 'blocksPublication' | 'evaluated'>
  & { evaluated?: boolean };

export function validateArticle(article: Partial<Article>): ArticleValidationReport {
  const raw: RawFinding[] = [];

  // ==========================================
  // CATEGORY A: REQUIRED EDITORIAL BLOCKERS
  // ==========================================

  // Check 1: Main Headline (Field 01)
  const headline = (article.title || article.headline || '').trim();
  raw.push({
    id: 'val-headline-req',
    group: 'On-page',
    severity: 'blocker',
    rule: 'Main Editorial Headline (H1) is required',
    field: 'title',
    message: headline ? 'Headline is present' : 'Article cannot be saved or published without a headline.',
    remediation: 'Provide a compelling, descriptive editorial title in Field 01.',
    passed: Boolean(headline),
  });

  // Check 2: Excerpt / Summary (Field 03)
  const excerpt = (article.excerpt || '').trim();
  raw.push({
    id: 'val-excerpt-req',
    group: 'Content & Topic',
    severity: 'blocker',
    rule: 'Editorial Excerpt / Summary is required for publication',
    field: 'excerpt',
    message: excerpt ? 'Summary excerpt is present' : 'Missing editorial summary required for article index cards and RSS syndication.',
    remediation: 'Write a 1–2 sentence summary (100–220 chars) in Field 03.',
    passed: Boolean(excerpt),
  });

  // Check 3: Structured Article Body Blocks (Field 04)
  const blocks = article.structuredBody || [];
  const hasSubstantialBody = blocks.length >= 2;
  raw.push({
    id: 'val-body-req',
    group: 'Content & Topic',
    severity: 'blocker',
    rule: 'Article body requires minimum structured content blocks',
    field: 'structuredBody',
    message: hasSubstantialBody
      ? `Body contains ${blocks.length} structured content blocks`
      : 'Article body is empty or lacks minimum structured blocks (requires at least 2 blocks).',
    remediation: 'Add opening paragraphs and analysis blocks in Field 04.',
    passed: hasSubstantialBody,
  });

  // Check 4: URL Slug Format
  const slug = (article.slug || '').trim();
  const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  raw.push({
    id: 'val-slug-format',
    group: 'Technical',
    severity: 'blocker',
    rule: 'URL Slug must be valid lowercase alphanumeric hyphenated',
    field: 'slug',
    message: validSlug
      ? `Valid slug: /articles/${slug}/`
      : 'Slug is missing or contains invalid characters (spaces, uppercase, symbols).',
    remediation: 'Ensure the slug uses clean lowercase words separated by hyphens.',
    passed: Boolean(slug && validSlug),
  });

  // ==========================================
  // CATEGORY B: RIGHTS, SAFETY & COMPLIANCE
  // ==========================================

  // Check 5: Featured Image Usage Rights — fail closed.
  const imageRights = article.imageRightsStatus || 'Unresolved';
  const hasRightsResolved = (RESOLVED_IMAGE_RIGHTS as readonly string[]).includes(imageRights);
  raw.push({
    id: 'val-image-rights',
    group: 'Image SEO',
    severity: 'compliance',
    rule: 'Featured photography usage rights must be verified',
    field: 'imageRightsStatus',
    message: hasRightsResolved
      ? `Verified rights: ${imageRights}`
      : 'Image rights are marked as Unresolved. Publishing unverified imagery breaches editorial policy.',
    remediation: 'Select Staff Photo, Editorial Pool, PRCA Archive, or Licensed Creative in the Media panel.',
    passed: hasRightsResolved,
  });

  // Check 6: Image Contextual ALT Text (Field 08)
  const altText = (article.imageAltText || '').trim();
  raw.push({
    id: 'val-alt-required',
    group: 'Image SEO',
    severity: 'compliance',
    rule: 'Featured image requires descriptive contextual ALT text',
    field: 'imageAltText',
    message: altText.length >= 10
      ? 'Contextual ALT text provided for accessibility'
      : 'Informative image lacks descriptive ALT text for visually impaired readers.',
    remediation: 'Provide descriptive visual context in Field 08 (minimum 10 characters).',
    passed: altText.length >= 10,
  });

  // Check 7: Commercial Monetization Disclosures
  const disclosure = article.disclosure || 'editorial-independent';
  const disclosureNote = (article.disclosureNote || '').trim();
  const disclosureValid = disclosure === 'editorial-independent' || Boolean(disclosureNote);
  raw.push({
    id: 'val-monetization-disclosure',
    group: 'External Links',
    severity: 'compliance',
    rule: 'Sponsored or affiliate content must include explicit FTC disclosure notice',
    field: 'disclosureNote',
    message: disclosureValid
      ? `Disclosure status: ${disclosure}`
      : 'Article is marked as sponsored/affiliate but lacks an explicit commercial disclosure note.',
    remediation: 'Add a reader transparency notice in the Commercial Disclosures panel.',
    passed: disclosureValid,
  });

  // Check 8: Scheduled Timestamp Validity — ONLY applicable when the article is SCHEDULED.
  const isScheduled = article.workflowStatus === 'scheduled';
  const scheduledAt = article.scheduledAt ? new Date(article.scheduledAt).getTime() : 0;
  const scheduledFuture = scheduledAt > Date.now();
  raw.push({
    id: 'val-scheduled-time',
    group: 'Freshness',
    severity: 'compliance',
    rule: 'Scheduled publication date must be in the future',
    field: 'scheduledAt',
    message: !isScheduled
      ? 'Not applicable — the article is not in a Scheduled state.'
      : scheduledFuture ? 'Valid future publication schedule' : 'Scheduled timestamp is missing or in the past.',
    remediation: 'Pick a valid future date and time for publication.',
    passed: !isScheduled ? true : scheduledFuture,
    evaluated: isScheduled, // not-evaluated (and excluded from tallies) when not scheduled
  });

  // ==========================================
  // CATEGORY C: SEO & QUALITY RECOMMENDATIONS
  // ==========================================

  // Check 9: SEO Title Length (Field 05)
  const seoTitle = (article.seo?.title || article.title || '').trim();
  const seoTitleLength = seoTitle.length;
  const seoTitleOptimal = seoTitleLength >= 35 && seoTitleLength <= 65;
  raw.push({
    id: 'val-seo-title-len',
    group: 'Search Appearance',
    severity: 'warning',
    rule: 'SEO Title length should be between 35 and 65 characters',
    field: 'seo.title',
    message: seoTitleOptimal
      ? `Optimal SEO title length (${seoTitleLength} chars)`
      : `Current SEO title is ${seoTitleLength} characters (recommended 35–65 to prevent SERP truncation).`,
    remediation: 'Fine-tune SEO title in Field 05 to fit Google search result snippets.',
    passed: seoTitleOptimal,
  });

  // Check 10: Meta Description Length (Field 06)
  const metaDesc = (article.seo?.description || article.excerpt || '').trim();
  const metaDescLength = metaDesc.length;
  const metaDescOptimal = metaDescLength >= 110 && metaDescLength <= 165;
  raw.push({
    id: 'val-meta-desc-len',
    group: 'Search Appearance',
    severity: 'warning',
    rule: 'Meta Description should be between 110 and 165 characters',
    field: 'seo.description',
    message: metaDescOptimal
      ? `Optimal meta description length (${metaDescLength} chars)`
      : `Current meta description is ${metaDescLength} characters (recommended 110–165).`,
    remediation: 'Adjust search snippet length in Field 06.',
    passed: metaDescOptimal,
  });

  // Check 11: Image SEO Title (Field 07)
  const imageSeoTitle = (article.imageSeoTitle || '').trim();
  raw.push({
    id: 'val-image-seo-title',
    group: 'Image SEO',
    severity: 'notice',
    rule: 'Featured Image SEO title helps media indexing',
    field: 'imageSeoTitle',
    message: imageSeoTitle ? 'Image SEO title present' : 'Recommended image title for Google Images indexing.',
    remediation: 'Provide an editorial title for the image in Field 07.',
    passed: Boolean(imageSeoTitle),
  });

  // Check 12: Heading Hierarchy
  const hasH2 = blocks.some((b) => b.type === 'heading' && b.level === 2);
  raw.push({
    id: 'val-heading-hierarchy',
    group: 'On-page',
    severity: 'notice',
    rule: 'Article body should include H2 section headings for scannability',
    field: 'structuredBody',
    message: hasH2 ? 'H2 headings present' : 'No H2 headings detected; long-form guides benefit from structured subheadings.',
    remediation: 'Add an H2 heading block in Field 04 to separate key sections.',
    passed: hasH2,
  });

  // Check 13: Direct Answer / AI Search Readiness
  const hasCalloutOrTakeaways =
    blocks.some((b) => b.type === 'callout') || (article.takeaways && article.takeaways.length > 0);
  raw.push({
    id: 'val-ai-readiness',
    group: 'AI Search Readiness',
    severity: 'notice',
    rule: 'Key takeaway callouts facilitate extraction in Google AI Overviews',
    field: 'structuredBody',
    message: hasCalloutOrTakeaways
      ? 'Executive takeaway / callout present'
      : 'Consider adding a Callout block with a 2–3 sentence direct answer capsule.',
    remediation: 'Add an "Editorial Takeaway" callout block to summarize key findings.',
    passed: Boolean(hasCalloutOrTakeaways),
  });

  // Check 14: Entity Association
  const hasEntityLinked =
    (article.associatedDisciplineIds && article.associatedDisciplineIds.length > 0) ||
    (article.associatedHubIds && article.associatedHubIds.length > 0) ||
    (article.associatedEventIds && article.associatedEventIds.length > 0) ||
    Boolean(article.associatedDisciplineId || article.associatedHubId || article.associatedEventId);
  raw.push({
    id: 'val-entity-association',
    group: 'Event SEO',
    severity: 'notice',
    rule: 'Link article to relevant rodeo disciplines, hubs, or recurring events',
    field: 'relationships',
    message: hasEntityLinked ? 'Rodeo entity relationships linked' : 'No disciplines or rodeo events linked.',
    remediation: 'Select relevant disciplines or events in the Rodeo Relationships panel.',
    passed: Boolean(hasEntityLinked),
  });

  // Check 15: Primary Source Provenance
  const hasSources = (article.sources && article.sources.length > 0) || blocks.some((b) => b.type === 'sourceLink');
  raw.push({
    id: 'val-sources-provenance',
    group: 'Structured Data',
    severity: 'notice',
    rule: 'Citing authoritative sources strengthens E-E-A-T and reader trust',
    field: 'sources',
    message: hasSources ? 'Citations and sources attached' : 'No primary sources attached to this article.',
    remediation: 'Link an official rulebook, scoring archive, or judicial manual in the Sources panel.',
    passed: hasSources,
  });

  // Check 16: Internal Links & Reader Recirculation
  const hasRelated = Boolean(
    (article.relatedArticleIds && article.relatedArticleIds.length > 0) ||
    blocks.some((b) => b.type === 'sourceLink' && b.url.startsWith('/'))
  );
  raw.push({
    id: 'val-internal-links',
    group: 'Internal Links',
    severity: 'notice',
    rule: 'Link to related editorial dispatches or discipline guides',
    field: 'relatedArticleIds',
    message: hasRelated ? 'Internal links or related dispatches linked' : 'No related dispatches linked for reader recirculation.',
    remediation: 'Select related articles in the Editorial Relationships panel to enhance internal link architecture.',
    passed: hasRelated,
  });

  // Check 17: Canonical URL Trailing-Slash Consistency
  const canonical = (article.seo?.canonicalUrl || '').trim();
  const validCanonicalFormat = !canonical || (canonical.startsWith('https://nfrguide.com/') && canonical.endsWith('/'));
  raw.push({
    id: 'val-canonical-redirects',
    group: 'Redirects',
    severity: 'notice',
    rule: 'Canonical URL must enforce standard trailing slash to eliminate redirect hops',
    field: 'seo.canonicalUrl',
    message: validCanonicalFormat ? 'Canonical URL conforms to trailing slash standards' : 'Canonical URL missing trailing slash; risk of redirect loop.',
    remediation: 'Ensure canonical path ends with a trailing slash (e.g. /articles/slug/).',
    passed: validCanonicalFormat,
  });

  // Enrich with presentation metadata (derived, not fabricated).
  const findings: ValidationFinding[] = raw.map((f) => {
    const meta = FIELD_META[f.id] ?? { category: 'Publication Readiness' as DisplayCategory, anchor: '', label: f.field };
    return {
      ...f,
      evaluated: f.evaluated ?? true,
      displayCategory: meta.category,
      fieldAnchor: meta.anchor,
      fieldLabel: meta.label,
      blocksPublication: f.severity === 'blocker' || f.severity === 'compliance',
    };
  });

  // Tallies — only EVALUATED checks count toward pass/fail/gate.
  const evaluated = findings.filter((f) => f.evaluated);
  const blockers = evaluated.filter((f) => f.severity === 'blocker' && !f.passed);
  const compliance = evaluated.filter((f) => f.severity === 'compliance' && !f.passed);
  const warnings = evaluated.filter((f) => f.severity === 'warning' && !f.passed);
  const notices = evaluated.filter((f) => f.severity === 'notice' && !f.passed);
  const notEvaluated = findings.filter((f) => !f.evaluated);

  const canPublish = blockers.length === 0 && compliance.length === 0;
  const passedChecks = evaluated.filter((f) => f.passed).length;
  const totalChecks = evaluated.length;
  const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

  return {
    findings,
    blockers,
    compliance,
    warnings,
    notices,
    notEvaluated,
    canPublish,
    score,
    totalChecks,
    passedChecks,
  };
}
