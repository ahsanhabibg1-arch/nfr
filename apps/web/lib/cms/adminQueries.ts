import 'server-only';
import { prisma } from '../db';
import { articleInclude, toArticle } from '../mappers';
import type { Article, ArticleRevision, ArticleWorkflowStatus } from '../../types';
import { WorkflowStatus } from '@prisma/client';

/**
 * Server-only admin reads (Batch 03). Unlike the public repository
 * (published-only), these return content in ANY workflow state for the
 * authenticated CMS. Never import into a Client Component.
 */

const STATUS_TO_TS: Record<WorkflowStatus, ArticleWorkflowStatus> = {
  DRAFT: 'draft', IN_REVIEW: 'in_review', APPROVED: 'approved',
  SCHEDULED: 'scheduled', PUBLISHED: 'published', ARCHIVED: 'archived',
};

function toRevision(r: {
  id: string; articleId: string; createdAt: Date; actorName: string; actorRole: string;
  status: WorkflowStatus; summary: string; snapshot: unknown;
}): ArticleRevision {
  return {
    id: r.id,
    articleId: r.articleId,
    timestamp: r.createdAt.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    actorName: r.actorName,
    actorRole: r.actorRole,
    status: STATUS_TO_TS[r.status],
    summary: r.summary,
    snapshot: (r.snapshot as Partial<Article>) ?? {},
  };
}

export interface EditableArticlePayload {
  article: Article;
  version: number;
  revisions: ArticleRevision[];
}

export async function getEditableArticle(id: string): Promise<EditableArticlePayload | null> {
  const row = await prisma.article.findUnique({ where: { id }, include: articleInclude });
  if (!row) return null;
  const revisions = await prisma.articleRevision.findMany({
    where: { articleId: id }, orderBy: { revisionNo: 'desc' }, take: 30,
  });
  return { article: toArticle(row), version: row.version, revisions: revisions.map(toRevision) };
}

export interface AdminArticleRow {
  id: string;
  slug: string;
  title: string;
  category: string;
  subcategory: string | null;
  authorName: string;
  articleType: string | null;
  workflowStatus: ArticleWorkflowStatus;
  publishedAt: string | null;
  createdById: string | null;
}

export async function getAdminArticleList(): Promise<AdminArticleRow[]> {
  const rows = await prisma.article.findMany({
    orderBy: [{ updatedAt: 'desc' }],
    include: { author: true, category: true },
  });
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    category: r.category.name,
    subcategory: r.subcategory,
    authorName: r.author.name,
    articleType: r.articleType,
    workflowStatus: STATUS_TO_TS[r.workflowStatus],
    publishedAt: r.publishedAt ? r.publishedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null,
    createdById: r.createdById,
  }));
}

export interface AdminOverviewStats {
  total: number;
  published: number;
  draft: number;
  inReview: number;
  scheduled: number;
}

export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  const [total, published, draft, inReview, scheduled] = await Promise.all([
    prisma.article.count(),
    prisma.article.count({ where: { workflowStatus: 'PUBLISHED' } }),
    prisma.article.count({ where: { workflowStatus: 'DRAFT' } }),
    prisma.article.count({ where: { workflowStatus: 'IN_REVIEW' } }),
    prisma.article.count({ where: { workflowStatus: 'SCHEDULED' } }),
  ]);
  return { total, published, draft, inReview, scheduled };
}
