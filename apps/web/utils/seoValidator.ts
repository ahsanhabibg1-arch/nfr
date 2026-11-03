import { Article } from '../types';
import { SEOGroup } from '../types/admin';

export type ValidationSeverity = 'blocker' | 'compliance' | 'warning' | 'notice';

/** Image rights statuses that clear the publish gate. Anything else (incl. unknown values) blocks. */
export const RESOLVED_IMAGE_RIGHTS = ['Staff Photo', 'Editorial Pool', 'PRCA Archive', 'Licensed Creative'] as const;

export interface ValidationFinding {
  id: string;
  group: SEOGroup;
  severity: ValidationSeverity;
  rule: string;
  field: string;
  message: string;
  remediation: string;
  passed: boolean;
}

export interface ArticleValidationReport {
  blockers: ValidationFinding[];
  compliance: ValidationFinding[];
  warnings: ValidationFinding[];
  notices: ValidationFinding[];
  canPublish: boolean;
  score: number;
  totalChecks: number;
  passedChecks: number;
}

export function validateArticle(article: Partial<Article>): ArticleValidationReport {
  const findings: ValidationFinding[] = [];

  // ==========================================
  // CATEGORY A: REQUIRED EDITORIAL BLOCKERS
  // ==========================================

  // Check 1: Main Headline (Field 01)
  const headline = (article.title || article.headline || '').trim();
  findings.push({
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
  findings.push({
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
  findings.push({
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
  findings.push({
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

  // Check 5: Featured Image Usage Rights
  // Fail closed: only an explicitly recognised, resolved rights status passes.
  const imageRights = article.imageRightsStatus || 'Unresolved';
  const hasRightsResolved = (RESOLVED_IMAGE_RIGHTS as readonly string[]).includes(imageRights);
  findings.push({
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
  findings.push({
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
  findings.push({
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

  // Check 8: Scheduled Timestamp Validity
  if (article.workflowStatus === 'scheduled') {
    const scheduledAt = article.scheduledAt ? new Date(article.scheduledAt).getTime() : 0;
    const isFuture = scheduledAt > Date.now();
    findings.push({
      id: 'val-scheduled-time',
      group: 'Freshness',
      severity: 'compliance',
      rule: 'Scheduled publication date must be in the future',
      field: 'scheduledAt',
      message: isFuture ? 'Valid future publication schedule' : 'Scheduled timestamp is missing or in the past.',
      remediation: 'Pick a valid future date and time for publication.',
      passed: isFuture,
    });
  }

  // ==========================================
  // CATEGORY C: SEO & QUALITY RECOMMENDATIONS
  // ==========================================

  // Check 9: SEO Title Length (Field 05)
  const seoTitle = (article.seo?.title || article.title || '').trim();
  const seoTitleLength = seoTitle.length;
  const seoTitleOptimal = seoTitleLength >= 35 && seoTitleLength <= 65;
  findings.push({
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
  findings.push({
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
  findings.push({
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
  findings.push({
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
  findings.push({
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
  findings.push({
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
  findings.push({
    id: 'val-sources-provenance',
    group: 'Structured Data',
    severity: 'notice',
    rule: 'Citing authoritative sources strengthens E-E-A-T and reader trust',
    field: 'sources',
    message: hasSources ? 'Citations and sources attached' : 'No primary sources attached to this article.',
    remediation: 'Link an official rulebook, scoring archive, or judicial manual in the Sources panel.',
    passed: Boolean(hasSources),
  });

  // Check 16: Internal Links & Reader Recirculation
  const hasRelated = Boolean(
    (article.relatedArticleIds && article.relatedArticleIds.length > 0) ||
    blocks.some((b) => b.type === 'sourceLink' && b.url.startsWith('/'))
  );
  findings.push({
    id: 'val-internal-links',
    group: 'Internal Links',
    severity: 'notice',
    rule: 'Link to related editorial dispatches or discipline guides',
    field: 'relatedArticleIds',
    message: hasRelated ? 'Internal links or related dispatches linked' : 'No related dispatches linked for reader recirculation.',
    remediation: 'Select related articles in the Editorial Relationships panel to enhance internal link architecture.',
    passed: hasRelated,
  });

  // Check 17: Canonical URL Trailing-Slash Consistency (Avoid Redirect Churn)
  const canonical = (article.seo?.canonicalUrl || '').trim();
  const validCanonicalFormat = !canonical || (canonical.startsWith('https://nfrguide.com/') && canonical.endsWith('/'));
  findings.push({
    id: 'val-canonical-redirects',
    group: 'Redirects',
    severity: 'notice',
    rule: 'Canonical URL must enforce standard trailing slash to eliminate redirect hops',
    field: 'seo.canonicalUrl',
    message: validCanonicalFormat ? 'Canonical URL conforms to trailing slash standards' : 'Canonical URL missing trailing slash; risk of redirect loop.',
    remediation: 'Ensure canonical path ends with a trailing slash (e.g. /articles/slug/).',
    passed: validCanonicalFormat,
  });

  // Compile totals
  const blockers = findings.filter((f) => f.severity === 'blocker' && !f.passed);
  const compliance = findings.filter((f) => f.severity === 'compliance' && !f.passed);
  const warnings = findings.filter((f) => f.severity === 'warning' && !f.passed);
  const notices = findings.filter((f) => f.severity === 'notice' && !f.passed);

  const canPublish = blockers.length === 0 && compliance.length === 0;
  const passedChecks = findings.filter((f) => f.passed).length;
  const totalChecks = findings.length;
  const score = Math.round((passedChecks / totalChecks) * 100);

  return {
    blockers,
    compliance,
    warnings,
    notices,
    canPublish,
    score,
    totalChecks,
    passedChecks,
  };
}
