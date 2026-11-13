import 'server-only';
import { Prisma, WorkflowStatus, ImageRightsStatus } from '@prisma/client';
import {
  Article,
  ContentBlock,
  SourceReference,
  PrimarySection,
  ArticleWorkflowStatus,
  Discipline,
} from '../types';
import { effectiveAlt, effectiveCaption, buildResponsiveSources } from './media/imageMeta';

/**
 * Delivery URL for a stored object — the SAME gated proxy path the storage
 * adapters return (`publicUrl()`), repeated here rather than imported so this
 * module stays free of the storage adapter's `server-only` client machinery.
 * `tests/med01bc-image-seo.test.ts` pins the two against each other.
 */
const mediaUrl = (key: string): string => `/api/media/${key}`;

/**
 * Prisma include shapes + row → domain mappers (Batch 02).
 * The mappers reconstruct the existing `Article`/`Discipline` TypeScript shapes
 * so every Phase 0/Batch 01 presentational component is reused unchanged.
 */

export const articleInclude = {
  author: true,
  category: true,
  seo: true,
  blocks: { orderBy: { sortOrder: 'asc' } },
  tags: { include: { tag: true } },
  sources: { include: { source: true }, orderBy: { sortOrder: 'asc' } },
  disciplines: true,
  hubs: true,
  events: true,
  editions: true,
  /**
   * MED-01B/C — the DAM record behind the hero image.
   *
   * `heroImageUrl` is a mirrored string, which is all the public site had: no
   * ALT default, no caption default, and no way to know that WebP derivatives
   * had been generated for this asset. Joining the hero `ArticleMedia` row here
   * — ONE place — is what lets `toArticle` resolve effective ALT/caption and a
   * responsive `srcset`, and every consumer of `toArticle` (the article page,
   * the homepage feed, the grids, related articles) gets it without its own
   * query. The join is narrow: one row by `usageKey`, a handful of columns.
   */
  media: {
    where: { usageKey: 'hero' },
    include: {
      media: {
        select: {
          altText: true,
          caption: true,
          derivatives: true,
          width: true,
          height: true,
          storageKey: true,
          url: true,
        },
      },
    },
  },
} satisfies Prisma.ArticleInclude;

export type ArticleWithRelations = Prisma.ArticleGetPayload<{ include: typeof articleInclude }>;

const WORKFLOW_TO_TS: Record<WorkflowStatus, ArticleWorkflowStatus> = {
  DRAFT: 'draft',
  IN_REVIEW: 'in_review',
  APPROVED: 'approved',
  SCHEDULED: 'scheduled',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
};

const RIGHTS_TO_TS: Record<ImageRightsStatus, NonNullable<Article['imageRightsStatus']>> = {
  STAFF_PHOTO: 'Staff Photo',
  EDITORIAL_POOL: 'Editorial Pool',
  PRCA_ARCHIVE: 'PRCA Archive',
  LICENSED_CREATIVE: 'Licensed Creative',
  UNRESOLVED: 'Unresolved',
};

/**
 * MED-01B/C — resolve the hero image's effective ALT, caption and responsive
 * sources once, on the server, where the DAM record is in hand.
 *
 * Doing it here rather than in each component means the precedence rule exists
 * in exactly one place (`lib/media/imageMeta.ts`), the SEO engine evaluates the
 * same values the HTML will carry, and a component cannot quietly substitute
 * the headline for missing ALT text again.
 *
 * `heroImageAlt` is always a string — `''` when an editor marked the asset
 * decorative, the headline when nothing is set anywhere (reported as
 * `IMG_NO_ALT`, never silently accepted). `heroImageCaption` is undefined when
 * nobody wrote one; no caption is invented.
 */
function heroImageMeta(row: ArticleWithRelations): Pick<
  Article,
  'heroImageAlt' | 'heroImageAltSource' | 'heroImageDecorative' | 'heroImageCaption' | 'heroImageSrcSet' | 'heroImageWidth' | 'heroImageHeight'
> {
  const usage = row.media?.find((m) => m.usageKey === 'hero');
  const asset = usage?.media ?? null;

  /**
   * `|| null` on the ARTICLE-level values, deliberately.
   *
   * An empty string means "decorative" only where the save path preserves it —
   * the media asset (`updateMediaMetadata` keeps an empty `altText`) and the
   * per-usage override. `saveArticle` stores `v.imageAltText || null`, so an
   * empty article field is not an editorial decision, just emptiness, and must
   * let the chain continue to the media default. `tests/seo-intel.test.ts`
   * pins exactly this case: an article published with `imageAltText: ''` and no
   * media ALT must still raise `IMG_NO_ALT`, which it would not if the empty
   * string were read as a deliberate decorative marker.
   */
  const alt = effectiveAlt({
    usage: usage?.altText,
    article: row.imageAltText || null,
    media: asset?.altText,
    fallback: row.title,
  });

  const caption = effectiveCaption({
    usage: usage?.caption,
    article: row.imageCaption || null,
    media: asset?.caption,
  });

  const responsive = asset
    ? buildResponsiveSources(
        asset.derivatives,
        { key: asset.storageKey, url: asset.url, width: asset.width },
        mediaUrl,
      )
    : { widths: [] as number[] };

  return {
    heroImageAlt: alt.alt,
    heroImageAltSource: alt.source,
    heroImageDecorative: alt.decorative,
    heroImageCaption: caption,
    heroImageSrcSet: responsive.srcSet,
    heroImageWidth: asset?.width ?? undefined,
    heroImageHeight: asset?.height ?? undefined,
  };
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function toArticle(row: ArticleWithRelations): Article {
  const blocks = row.blocks.map((b) => b.data as unknown as ContentBlock);
  const paragraphs = blocks
    .filter((b): b is Extract<ContentBlock, { type: 'paragraph' }> => b.type === 'paragraph')
    .map((b) => b.text);

  const sources: SourceReference[] = row.sources.map((s) => ({
    id: s.source.id,
    title: s.source.title,
    url: s.source.url,
    publisher: s.source.publisher ?? '',
    note: s.note ?? undefined,
    classification:
      s.source.classification === 'OFFICIAL'
        ? 'Official'
        : s.source.classification === 'HISTORICAL_ARCHIVE'
          ? 'Historical Archive'
          : 'Independent Reference',
    status:
      s.source.status === 'VERIFIED'
        ? 'verified'
        : s.source.status === 'EXPIRED'
          ? 'expired'
          : 'needs_review',
  }));

  const workflowStatus = WORKFLOW_TO_TS[row.workflowStatus];

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    headline: row.title,
    deck: row.deck ?? '',
    excerpt: row.excerpt,
    content: paragraphs,
    structuredBody: blocks,
    category: row.category.name as PrimarySection,
    subcategory: row.subcategory ?? undefined,
    articleType: (row.articleType as Article['articleType']) ?? undefined,
    status: workflowStatus === 'published' ? 'published' : workflowStatus === 'archived' ? 'archived' : 'draft',
    workflowStatus,
    readTime: row.readTime ?? '',
    wordCount: row.wordCount ?? undefined,
    author: {
      name: row.author.name,
      role: row.author.role,
      avatar: row.author.avatar ?? undefined,
      bio: row.author.bio ?? undefined,
      credentials: row.author.credentials ?? undefined,
      editorialBeat: row.author.editorialBeat ?? undefined,
    },
    publishedAt: formatDate(row.publishedAt),
    updatedAt: formatDate(row.updatedAt),
    scheduledAt: row.scheduledAt ? row.scheduledAt.toISOString() : undefined,
    heroImage: row.heroImageUrl ?? '',
    imageCredit: row.imageCredit ?? '',
    imageCaption: row.imageCaption ?? undefined,
    imageAltText: row.imageAltText ?? undefined,
    imageSeoTitle: row.imageSeoTitle ?? undefined,
    ...heroImageMeta(row),
    imageRightsStatus: RIGHTS_TO_TS[row.imageRightsStatus],
    isLeadHero: row.isLeadHero,
    isFeatured: row.isFeatured,
    takeaways: row.takeaways ?? [],
    tags: row.tags.map((t) => t.tag.name),
    sources,
    associatedDisciplineIds: row.disciplines.map((d) => d.disciplineId),
    associatedHubIds: row.hubs.map((h) => h.hubId),
    associatedEventIds: row.events.map((e) => e.eventId),
    associatedEditionIds: row.editions.map((e) => e.editionId),
    seo: row.seo
      ? {
          title: row.seo.seoTitle ?? row.title,
          description: row.seo.metaDescription ?? row.excerpt,
          canonicalUrl: row.seo.canonicalUrl ?? undefined,
          ogImage: row.seo.ogImage ?? undefined,
          robots: row.seo.robots ?? undefined,
          storedTitle: row.seo.seoTitle?.trim() || undefined,
          storedDescription: row.seo.metaDescription?.trim() || undefined,
        }
      : undefined,
    disclosure: (row.disclosureType as Article['disclosure']) ?? undefined,
    disclosureNote: row.disclosureNote ?? undefined,
  };
}

export function toDiscipline(row: {
  id: string; slug: string; name: string; shortName: string | null; category: string | null;
  tagline: string | null; summary: string; image: string | null; imageCredit: string | null;
  guide: Prisma.JsonValue | null;
  archivedAt?: Date | null;
}): Discipline {
  const guide = (row.guide as Record<string, unknown>) ?? {};
  return {
    id: row.id,
    archivedAt: row.archivedAt ?? null,
    slug: row.slug,
    name: row.name,
    shortName: row.shortName ?? row.name,
    category: (row.category as Discipline['category']) ?? 'Roughstock',
    tagline: row.tagline ?? '',
    summary: row.summary,
    image: row.image ?? '',
    imageCredit: row.imageCredit ?? '',
    /**
     * Guide-derived collections default to empty BEFORE the spread, so real
     * guide content still overrides them (Rodeo Coverage admin audit).
     *
     * `Discipline` declares `scoringBreakdown` and `rulesHighlights` as
     * REQUIRED, but they only ever arrive via the spread of the optional `guide`
     * JSON — and the trailing `as Discipline` cast asserted they were present
     * without checking. For a discipline with `guide = null` they were simply
     * undefined, and the type system had been told not to care, so
     * `DisciplineGuideView` crashed on `.map()` and the public route failed to
     * prerender.
     *
     * Defaulting here fixes every consumer at once rather than guarding at each
     * render site, which matters now that an editor can create a discipline with
     * no guide content from the Rodeo Coverage admin.
     */
    scoringBreakdown: [],
    rulesHighlights: [],
    ...(guide as Partial<Discipline>),
  } as Discipline;
}
