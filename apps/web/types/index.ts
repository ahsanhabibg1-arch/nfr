/**
 * NFRGuide Editorial Data Models & Types
 * Phase 0 Prompt 02: Editorial Page System, Dedicated Templates & Routing Foundation
 */

import type { DisciplineClassification } from '../lib/content/disciplineClassifications';
import type { InlineRun } from '../lib/content/articleInline';
import type { BlockAlignment, BodyHeadingLevel } from '../lib/content/articleBlockStyle';
import type { VideoProvider } from '../lib/content/articleEmbeds';

/**
 * The five FOUNDATIONAL primary sections.
 *
 * Stage 02 (H-01): this is no longer the type of `Article.category`. Categories
 * are administrator-creatable, so the set of valid values is database state and
 * a compiled-in union could not describe it — a union missing a category an
 * administrator created makes legitimate data a type error and invites casts
 * that hide real mistakes (the same reasoning that widened `ArticleType` in
 * Batch 04-E).
 *
 * It remains exported, unchanged, because the five canonical sections keep
 * their own routes, navigation, EntitySeo ids and sitemap entries, and plenty
 * of code legitimately means *these five* rather than "any category".
 */
export type PrimarySection =
  | 'NFR Competition'
  | 'NFR Entertainment'
  | 'NFR Events & Shopping'
  | 'NFR Plan & Watch'
  | 'More Rodeo';

export type ArticleStatus = 'published' | 'draft' | 'archived' | 'in_review' | 'approved' | 'scheduled';

export type ArticleWorkflowStatus = 'draft' | 'in_review' | 'approved' | 'scheduled' | 'published' | 'archived';

/**
 * The COMPATIBILITY article-type vocabulary: the 18 selectable typologies plus
 * the 5 recognised legacy values that this release ships with and bootstraps
 * the managed `ArticleType` table from (Batch 04-A, 04-E).
 *
 * It is no longer the type of `Article.articleType` — administrators can create
 * types, so stored values are database state. Use it where the compiled-in set
 * is genuinely what is meant (the bootstrap definitions, the fallback registry).
 */
export type ArticleType =
  | 'News'
  | 'Event Update'
  | 'Event Guide'
  | 'Schedule'
  | 'Results & Standings'
  | 'How to Watch'
  | 'Preview'
  | 'Competitor Profile'
  | 'Rules & Format'
  | 'History'
  | 'Records & Past Winners'
  | 'Entertainment Guide'
  | 'Ticket Guide'
  | 'Venue Guide'
  | 'Travel Guide'
  | 'Product Buying Guide'
  | 'Product Review'
  | 'General Information'
  | 'feature'
  | 'analysis'
  | 'guide'
  | 'explainer'
  | 'news';

export type DisclosureType = 'none' | 'affiliate' | 'sponsored' | 'editorial-independent';

export interface Author {
  name: string;
  role: string;
  avatar?: string;
  bio?: string;
  credentials?: string;
  editorialBeat?: string;
}

/**
 * Article body blocks.
 *
 * INLINE FORMATTING (`runs`). Text-bearing blocks may carry an optional
 * `runs` array describing bold / italic / underline / strikethrough / links
 * inside the text. `text` remains the authoritative PLAIN-TEXT PROJECTION and
 * must always equal the concatenation of the runs, so every consumer that only
 * wants words — SEO word count, read time, previews — keeps reading `text` and
 * is unaffected. A block with no `runs` renders exactly as it always did.
 * See `lib/content/articleInline.ts` for the model and its guarantees.
 */
export type ContentBlock =
  | { type: 'heading'; level: BodyHeadingLevel; text: string; id?: string; align?: BlockAlignment; runs?: InlineRun[] }
  | { type: 'paragraph'; text: string; isDropCap?: boolean; align?: BlockAlignment; runs?: InlineRun[] }
  | { type: 'quote'; quote: string; attribution: string; role?: string; quoteRuns?: InlineRun[] }
  /**
   * `checklist` makes the list a task list; `checked` is positional and
   * parallel to `items`. Both are optional, so every list stored before
   * checklists existed is unchanged and renders as it always did.
   */
  | { type: 'list'; items: string[]; ordered?: boolean; checklist?: boolean; checked?: boolean[]; itemRuns?: (InlineRun[] | null)[] }
  | { type: 'table'; headers: string[]; rows: string[][]; caption?: string }
  | { type: 'callout'; variant?: 'info' | 'takeaway' | 'warning' | 'curator'; title?: string; text: string; runs?: InlineRun[] }
  | { type: 'image'; src: string; alt: string; caption?: string; credit?: string }
  | { type: 'sourceLink'; title: string; url: string; publisher?: string; note?: string }
  | { type: 'disclosure'; text: string; variant?: 'affiliate' | 'editorial' | 'partner' }
  | { type: 'divider' }
  | { type: 'faq'; title?: string; items: { question: string; answer: string; answerRuns?: InlineRun[] }[] }
  /**
   * End-of-section notes, numbered by position. The in-text marker is the
   * author's to place with the superscript mark — there is no identifier inside
   * the inline run model to link the two automatically, and inventing one would
   * change the `runs` contract every stored article already satisfies.
   */
  | { type: 'footnotes'; title?: string; items: { text: string; runs?: InlineRun[] }[] }
  | {
      type: 'gallery';
      layout?: 'grid' | 'row';
      caption?: string;
      images: { src: string; alt: string; caption?: string; credit?: string }[];
    }
  /**
   * An approved embed. The provider is a closed list and `videoId` is an opaque
   * token; the renderer builds the iframe source from the two, so content never
   * chooses the origin of a frame on the page.
   */
  | { type: 'video'; provider: VideoProvider; videoId: string; title: string; caption?: string };

export interface SourceReference {
  id: string;
  title: string;
  url?: string;
  publisher: string;
  date?: string;
  note?: string;
  classification?: 'Official' | 'Independent Reference' | 'Historical Archive';
  status?: 'verified' | 'needs_review' | 'expired';
}

export interface SEOMetadata {
  title: string;
  description: string;
  canonicalUrl?: string;
  ogImage?: string;
  structuredDataType?: 'Article' | 'NewsArticle' | 'Guide' | 'BreadcrumbList';
  /** Stored robots directive (free text, e.g. "index, follow"); parsed by lib/seo/articleMeta.ts. */
  robots?: string;
  /**
   * Raw stored overrides (undefined when the column is null/blank). `title` / `description`
   * above already include fallbacks for editor/validator use; public metadata needs to know
   * whether an override exists so it can keep the page's own fallback order.
   */
  storedTitle?: string;
  storedDescription?: string;
}

export interface ArticleRevision {
  id: string;
  articleId: string;
  timestamp: string;
  actorName: string;
  actorRole: string;
  status: ArticleWorkflowStatus;
  summary: string;
  snapshot: Partial<Article>;
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  headline?: string; // Editorial headline alias
  wordCount?: number; // Estimated words
  deck: string; // Editorial summary / kicker
  excerpt?: string; // Concise summary
  content: string[]; // Editorial paragraphs (preserved for backward compatibility)
  structuredBody?: ContentBlock[]; // Rich structured blocks
  /**
   * The article's primary section, as the managed `Category` record names it.
   *
   * Stage 02 (H-01): widened from `PrimarySection` to `string` so an
   * administrator-created category is representable. The five foundational
   * sections are still exactly the values `PrimarySection` lists; validation of
   * what may actually be stored happens server-side in `resolveCategoryId`,
   * which looks the name up in the database and refuses an unknown one.
   */
  category: string;
  /**
   * Stage 03 (R-3) — the category's URL slug, carried from the same join that
   * already supplies the name. Breadcrumbs need it to link a non-canonical
   * category to `/categories/<slug>/` instead of guessing, and taking it from
   * the existing `include` costs no extra query.
   */
  categorySlug?: string;
  subcategory?: string;
  /**
   * Batch 04-E — the STORED article type, as a plain string.
   *
   * It was the `ArticleType` union below. Once administrators can create types
   * (Batch 04-E), the set of valid values is database state, so a compiled-in
   * union could no longer describe it — and a union that is missing values an
   * administrator has created is worse than no union: it makes legitimate data
   * a type error and invites casts that hide real mistakes.
   *
   * `ArticleType` is still exported, unchanged, as the compatibility vocabulary
   * (the 18 selectable + 5 legacy values this release ships and bootstraps
   * with). Validation of what may actually be stored is enforced at the write
   * boundary in `saveArticle`, against the managed registry.
   */
  articleType?: string;
  status?: ArticleStatus;
  workflowStatus?: ArticleWorkflowStatus;
  readTime: string;
  author: Author;
  reviewerName?: string;
  publishedAt: string;
  updatedAt?: string;
  reviewedAt?: string;
  scheduledAt?: string;
  heroImage: string;
  imageCredit: string;
  imageRightsStatus?: 'Staff Photo' | 'Editorial Pool' | 'PRCA Archive' | 'Licensed Creative' | 'Unresolved';
  imageSeoTitle?: string;
  imageAltText?: string;
  imageCaption?: string;
  /**
   * Batch 04-B — the managed subcategory, when one is assigned.
   *
   * `subcategory` above stays the DISPLAY label and already resolves
   * `managed ?? legacy` in `toArticle`, so every existing consumer keeps
   * working untouched. These two exist for the cases that need to tell them
   * apart: an editor showing the legacy value as context, and a future
   * subcategory route needing the id/slug.
   */
  subcategoryRef?: { id: string; name: string; slug: string };
  legacySubcategory?: string;
  /**
   * MED-01B/C — hero image metadata RESOLVED on the server (`lib/mappers.ts`
   * via `lib/media/imageMeta.ts`). Components render these instead of
   * re-deriving ALT text, so the precedence rule lives in one place and the SEO
   * engine evaluates exactly what the HTML will carry.
   */
  /** Effective ALT. `''` means an editor marked the image decorative. */
  heroImageAlt?: string;
  /** Which level supplied it: 'usage' | 'article' | 'media' | 'fallback'. */
  heroImageAltSource?: 'usage' | 'article' | 'media' | 'fallback';
  /** True only when ALT was deliberately left empty. */
  heroImageDecorative?: boolean;
  /** Effective caption; undefined when nobody wrote one (none is invented). */
  heroImageCaption?: string;
  /** `srcset` built from the stored WebP derivatives; undefined for legacy assets. */
  heroImageSrcSet?: string;
  heroImageWidth?: number;
  heroImageHeight?: number;
  isLeadHero?: boolean;
  isFeatured?: boolean;
  takeaways?: string[];
  pullQuote?: {
    quote: string;
    attribution: string;
  };
  tags?: string[];
  relatedArticleIds?: string[];
  sources?: SourceReference[];
  associatedDisciplineId?: string;
  associatedHubId?: string;
  associatedEventId?: string;
  associatedDisciplineIds?: string[];
  associatedHubIds?: string[];
  associatedEventIds?: string[];
  associatedEditionIds?: string[];
  seo?: SEOMetadata;
  disclosure?: DisclosureType;
  disclosureNote?: string;
  revisions?: ArticleRevision[];
}

export interface Discipline {
  id: string;
  /** Archive lifecycle: set when the discipline has been archived, else null. */
  archivedAt?: Date | null;
  name: string;
  shortName: string;
  slug: string;
  /**
   * LEGACY classification text, preserved. Still populated and still used as
   * the fallback when the managed vocabulary is unavailable; `classification`
   * below is the authority when present. NOT the editorial section taxonomy,
   * which is administrator-owned `Category` rows.
   */
  category: DisciplineClassification;
  /**
   * Batch 05 — the MANAGED classification. Carries a stable `id`, so the public
   * filter groups by identity rather than by a mutable display label and a
   * rename cannot break it. Null when unclassified or when the managed table is
   * unavailable.
   */
  classification?: { id: string; name: string; pluralName: string } | null;
  tagline: string;
  summary: string;
  introduction?: string;
  competitionFormat?: string;
  scoringBreakdown: {
    title: string;
    description: string;
  }[];
  rulesHighlights: string[];
  terminology?: { term: string; definition: string }[];
  stockProfile: string;
  historicBenchmark: string;
  beginnerTips?: string[];
  sources?: SourceReference[];
  image: string;
  imageCredit: string;
  relatedArticleSlugs?: string[];
  /**
   * Issue 03 — hero metadata resolved on the server from the Media Library
   * asset behind `image`, exactly as the article hero does (MED-01B). The
   * component renders these and derives nothing.
   */
  imageAlt?: string;
  imageAltSource?: 'usage' | 'article' | 'media' | 'fallback';
  imageCaption?: string;
  imageSrcSet?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export interface QuickLinkItem {
  id: string;
  title: string;
  description: string;
  category: string;
  targetSectionId: string;
  targetRoute?: string;
  badge?: string;
}

export interface PlanGuide {
  id: string;
  title: string;
  subtopic: 'Broadcast & Streaming' | 'Tickets' | 'Accommodations' | 'Las Vegas Travel' | 'Venue Navigation';
  readTime: string;
  summary: string;
  keyAdvice: string;
  image: string;
  imageCredit: string;
  articleSlug: string;
}

export interface EntertainmentFeature {
  id: string;
  title: string;
  type: 'Concerts' | 'After-Parties' | 'Watch Parties' | 'Awards' | 'Fan Experiences';
  venue: string;
  dateContext: string;
  summary: string;
  highlights: string[];
  image: string;
  imageCredit: string;
  articleSlug?: string;
}

export interface ShoppingEvent {
  id: string;
  title: string;
  type: 'Cowboy Christmas' | 'Junior NFR' | 'Miss Rodeo America' | 'Western Fashion & Tack';
  venue: string;
  admissionNote: string;
  summary: string;
  commercialStatus: 'Editorial Selection' | 'Visitor Exhibition Guide';
  image: string;
  imageCredit: string;
  articleSlug?: string;
}

export interface RodeoHub {
  id: string;
  title: string;
  slug: string;
  region: string;
  description: string;
  circuitType: string;
  annualEventsCount: number;
}

export interface RecurringRodeoEvent {
  id: string;
  name: string;
  slug: string;
  hubId: string;
  location: string;
  traditionalMonth: string;
  status: 'Crown Jewel' | 'Major Circuit Championship' | 'Heritage Invitational';
  description: string;
  currentEdition: {
    year: number;
    dates: string;
    purseBenchmark: string;
  };
}

export interface LearningItem {
  id: string;
  title: string;
  slug?: string;
  category: 'Rodeo Rules' | 'Scoring Breakdown' | 'Terminology' | 'First-Timer Guide';
  summary: string;
  bullets: string[];
  didYouKnow: string;
}

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

/** Lightweight published-article index row used by the client search modal. */
export interface SearchIndexItem {
  id: string;
  slug: string;
  title: string;
  deck: string;
  category: string;
  readTime: string;
}
