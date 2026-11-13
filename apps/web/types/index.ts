/**
 * NFRGuide Editorial Data Models & Types
 * Phase 0 Prompt 02: Editorial Page System, Dedicated Templates & Routing Foundation
 */

export type PrimarySection = 
  | 'NFR Competition'
  | 'NFR Entertainment'
  | 'NFR Events & Shopping'
  | 'NFR Plan & Watch'
  | 'More Rodeo';

export type ArticleStatus = 'published' | 'draft' | 'archived' | 'in_review' | 'approved' | 'scheduled';

export type ArticleWorkflowStatus = 'draft' | 'in_review' | 'approved' | 'scheduled' | 'published' | 'archived';

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

export type ContentBlock = 
  | { type: 'heading'; level: 2 | 3; text: string; id?: string }
  | { type: 'paragraph'; text: string; isDropCap?: boolean }
  | { type: 'quote'; quote: string; attribution: string; role?: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'table'; headers: string[]; rows: string[][]; caption?: string }
  | { type: 'callout'; variant?: 'info' | 'takeaway' | 'warning' | 'curator'; title?: string; text: string }
  | { type: 'image'; src: string; alt: string; caption?: string; credit?: string }
  | { type: 'sourceLink'; title: string; url: string; publisher?: string; note?: string }
  | { type: 'disclosure'; text: string; variant?: 'affiliate' | 'editorial' | 'partner' }
  | { type: 'divider' };

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
  category: PrimarySection;
  subcategory?: string;
  articleType?: ArticleType;
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
  category: 'Roughstock' | 'Timed Event';
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
