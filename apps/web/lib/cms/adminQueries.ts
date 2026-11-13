import 'server-only';
import { prisma } from '../db';
import { articleInclude, toArticle } from '../mappers';
import type { Article, ArticleRevision, ArticleWorkflowStatus } from '../../types';
import { Prisma, WorkflowStatus } from '@prisma/client';
import type { ArticleRelationshipOptions, SourceDirectoryOption } from './relationshipTypes';

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

/** Database-backed choices for the article editor's rodeo relationships panel. */
export async function listArticleRelationshipOptions(): Promise<ArticleRelationshipOptions> {
  const [disciplines, hubs, events, editions, subcategories] = await Promise.all([
    prisma.discipline.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, category: true } }),
    prisma.rodeoHub.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, region: true } }),
    prisma.rodeoEvent.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, location: true } }),
    prisma.rodeoEventEdition.findMany({
      orderBy: [{ eventId: 'asc' }, { editionSlug: 'desc' }],
      select: { id: true, label: true, eventId: true, editionSlug: true },
    }),
    /**
     * Batch 04-B — active managed subcategories with their section's NAME.
     * `archivedAt: null` is what keeps an archived subcategory out of new
     * assignments while leaving articles that already use it untouched.
     */
    prisma.subcategory.findMany({
      where: { archivedAt: null },
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, category: { select: { name: true } } },
    }),
  ]);

  const subcategoriesBySection: Record<string, { id: string; label: string }[]> = {};
  for (const sub of subcategories) {
    (subcategoriesBySection[sub.category.name] ??= []).push({ id: sub.id, label: sub.name });
  }
  return {
    disciplines: disciplines.map((d) => ({ id: d.id, label: d.name, detail: d.category })),
    hubs: hubs.map((h) => ({ id: h.id, label: h.title, detail: h.region })),
    events: events.map((e) => ({ id: e.id, label: e.name, detail: e.location })),
    editions: editions.map((e) => ({ id: e.id, label: e.label, detail: e.editionSlug, eventId: e.eventId })),
    subcategoriesBySection,
  };
}

/** The real Source directory for the editor's "attach existing source" picker (Batch A, D6). */
export async function listSourceDirectoryOptions(): Promise<SourceDirectoryOption[]> {
  const rows = await prisma.source.findMany({
    orderBy: { title: 'asc' },
    take: 500,
    select: { id: true, title: true, publisher: true, url: true, type: true, status: true, classification: true },
  });
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    publisher: s.publisher,
    url: s.url,
    type: s.type,
    status: s.status === 'VERIFIED' ? 'verified' : s.status === 'EXPIRED' ? 'expired' : 'needs_review',
    classification: s.classification === 'OFFICIAL' ? 'Official' : s.classification === 'HISTORICAL_ARCHIVE' ? 'Historical Archive' : 'Independent Reference',
  }));
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

const TS_TO_STATUS: Record<string, WorkflowStatus> = {
  draft: 'DRAFT', in_review: 'IN_REVIEW', approved: 'APPROVED', scheduled: 'SCHEDULED', published: 'PUBLISHED', archived: 'ARCHIVED',
};

export interface ArticleListParams {
  q?: string;
  status?: string;        // lowercase workflow status
  categorySlug?: string;
  disciplineSlug?: string;
  authorName?: string;
  sort?: 'updated' | 'created' | 'published';
  dir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface ArticleListResult {
  rows: AdminArticleRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Server-side article search / filter / sort / pagination (Batch 04 §5). */
export async function getAdminArticleList(params: ArticleListParams = {}): Promise<ArticleListResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(5, params.pageSize ?? 10));

  const where: Prisma.ArticleWhereInput = {};
  if (params.status && TS_TO_STATUS[params.status]) where.workflowStatus = TS_TO_STATUS[params.status];
  if (params.categorySlug) where.category = { slug: params.categorySlug };
  if (params.disciplineSlug) where.disciplines = { some: { discipline: { slug: params.disciplineSlug } } };
  if (params.authorName) where.author = { name: params.authorName };
  if (params.q) {
    where.OR = [
      { title: { contains: params.q, mode: 'insensitive' } },
      { excerpt: { contains: params.q, mode: 'insensitive' } },
      { author: { name: { contains: params.q, mode: 'insensitive' } } },
    ];
  }

  const sortField = params.sort === 'created' ? 'createdAt' : params.sort === 'published' ? 'publishedAt' : 'updatedAt';
  const dir = params.dir === 'asc' ? 'asc' : 'desc';

  const [total, rows] = await Promise.all([
    prisma.article.count({ where }),
    prisma.article.findMany({
      where,
      orderBy: { [sortField]: dir },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { author: true, category: true },
    }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id, slug: r.slug, title: r.title, category: r.category.name, subcategory: r.subcategory,
      authorName: r.author.name, articleType: r.articleType, workflowStatus: STATUS_TO_TS[r.workflowStatus],
      publishedAt: r.publishedAt ? r.publishedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null,
      createdById: r.createdById,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export interface DashboardData {
  statusCounts: Record<ArticleWorkflowStatus, number>;
  total: number;
  bySection: { name: string; published: number }[];
  byDiscipline: { name: string; slug: string; published: number }[];
  recentlyUpdated: { id: string; title: string; status: ArticleWorkflowStatus; updatedAt: string }[];
  pendingReviews: { id: string; title: string; authorName: string; updatedAt: string }[];
  recentActivity: { id: string; action: string; entityType: string; entityId: string | null; actorName: string; at: string }[];
  scopedToOwn: boolean;
}

const ALL_STATUSES: WorkflowStatus[] = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'];

/**
 * Real editorial dashboard metrics (Batch 04 §4). Published counts are public;
 * private lists (recently updated, pending reviews) are scoped to the viewer's
 * own content unless they can view all (editors+). No fabricated analytics.
 */
export async function getDashboardData(opts: { viewerId: string; canViewAll: boolean }): Promise<DashboardData> {
  const ownScope = opts.canViewAll ? {} : { createdById: opts.viewerId };

  const [counts, publishedRows, discLinks, recentlyUpdated, pending, activity] = await Promise.all([
    prisma.article.groupBy({ by: ['workflowStatus'], _count: { _all: true } }),
    prisma.article.findMany({ where: { workflowStatus: 'PUBLISHED' }, select: { category: { select: { name: true } } } }),
    prisma.articleDiscipline.findMany({ where: { article: { workflowStatus: 'PUBLISHED' } }, select: { discipline: { select: { name: true, slug: true } } } }),
    prisma.article.findMany({ where: ownScope, orderBy: { updatedAt: 'desc' }, take: 8, select: { id: true, title: true, workflowStatus: true, updatedAt: true } }),
    prisma.article.findMany({ where: { workflowStatus: 'IN_REVIEW', ...ownScope }, orderBy: { updatedAt: 'desc' }, take: 8, select: { id: true, title: true, updatedAt: true, author: { select: { name: true } } } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 12, include: { actor: { select: { name: true } } } }),
  ]);

  const statusCounts = ALL_STATUSES.reduce((acc, s) => { acc[STATUS_TO_TS[s]] = 0; return acc; }, {} as Record<ArticleWorkflowStatus, number>);
  let total = 0;
  for (const c of counts) { statusCounts[STATUS_TO_TS[c.workflowStatus]] = c._count._all; total += c._count._all; }

  const sectionTally = new Map<string, number>();
  for (const r of publishedRows) sectionTally.set(r.category.name, (sectionTally.get(r.category.name) ?? 0) + 1);

  const discTally = new Map<string, { name: string; slug: string; published: number }>();
  for (const l of discLinks) {
    const key = l.discipline.slug;
    const e = discTally.get(key) ?? { name: l.discipline.name, slug: l.discipline.slug, published: 0 };
    e.published += 1;
    discTally.set(key, e);
  }

  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtTime = (d: Date) => d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return {
    statusCounts,
    total,
    bySection: [...sectionTally.entries()].map(([name, published]) => ({ name, published })).sort((a, b) => b.published - a.published),
    byDiscipline: [...discTally.values()].sort((a, b) => b.published - a.published),
    recentlyUpdated: recentlyUpdated.map((a) => ({ id: a.id, title: a.title, status: STATUS_TO_TS[a.workflowStatus], updatedAt: fmt(a.updatedAt) })),
    pendingReviews: pending.map((a) => ({ id: a.id, title: a.title, authorName: a.author.name, updatedAt: fmt(a.updatedAt) })),
    recentActivity: activity.map((a) => ({ id: a.id, action: a.action, entityType: a.entityType, entityId: a.entityId, actorName: a.actor?.name ?? 'System', at: fmtTime(a.createdAt) })),
    scopedToOwn: !opts.canViewAll,
  };
}
