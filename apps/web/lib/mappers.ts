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
}): Discipline {
  const guide = (row.guide as Record<string, unknown>) ?? {};
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: row.shortName ?? row.name,
    category: (row.category as Discipline['category']) ?? 'Roughstock',
    tagline: row.tagline ?? '',
    summary: row.summary,
    image: row.image ?? '',
    imageCredit: row.imageCredit ?? '',
    ...(guide as Partial<Discipline>),
  } as Discipline;
}
