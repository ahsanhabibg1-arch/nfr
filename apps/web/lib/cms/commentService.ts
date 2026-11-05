import 'server-only';
import { z } from 'zod';
import { Prisma, type CommentStatus } from '@prisma/client';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { Permission, roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import { checkDurableRateLimit } from '../auth/durableRateLimit';

/**
 * Article comments (Batch 24). Flat, plain-text, moderated. Only authenticated ACTIVE
 * users may comment on PUBLISHED articles; new comments default to PENDING and only
 * APPROVED comments are public. Bodies are stored as plain text and rendered as escaped
 * React children (no raw HTML / scripts / embeds). Moderation is RBAC-gated + audited.
 */
export const COMMENT_MAX_LEN = 2000;
const BodySchema = z.string().trim().min(1, 'Comment cannot be empty.').max(COMMENT_MAX_LEN, `Comment must be ${COMMENT_MAX_LEN} characters or fewer.`);
const reqPerm = (a: Actor, perm: Permission) => { if (!roleHasPermission(a.roles, perm)) throw new ServiceError('forbidden', `Missing permission: ${perm}`); };

/** Reader submits a comment → PENDING. Auth + published-article + anti-spam checks. */
export async function createComment(userId: string, articleId: string, rawBody: string): Promise<{ id: string; status: CommentStatus }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!user || user.status !== 'ACTIVE') throw new ServiceError('forbidden', 'Your account is not allowed to comment.');
  const body = BodySchema.parse(rawBody);
  const article = await prisma.article.findUnique({ where: { id: articleId }, select: { workflowStatus: true } });
  if (!article || article.workflowStatus !== 'PUBLISHED') throw new ServiceError('not_found', 'Article not found or not published.');
  // Anti-spam: 5 comments / 5 min per user (durable, fail-closed limiter).
  const rl = await checkDurableRateLimit(`comment:${userId}`, 5, 5 * 60 * 1000);
  if (!rl.allowed) throw new ServiceError('rate_limited', 'You are commenting too quickly. Please wait a moment and try again.');
  const c = await prisma.articleComment.create({ data: { articleId, authorId: userId, body, status: 'PENDING' }, select: { id: true, status: true } });
  await audit(userId, 'comment.create', 'article_comment', c.id, articleId);
  return c;
}

/** Public: approved comments for an article (no private data — display name only). */
export async function listApprovedForArticle(articleId: string) {
  const rows = await prisma.articleComment.findMany({
    where: { articleId, status: 'APPROVED' },
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, author: r.author.name, body: r.body, createdAt: r.createdAt.toISOString() }));
}

/** A reader's own comments (all statuses, so they can see pending/rejected). */
export async function listMyComments(userId: string) {
  const rows = await prisma.articleComment.findMany({
    where: { authorId: userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { article: { select: { slug: true, title: true } } },
  });
  return rows.map((r) => ({ id: r.id, status: r.status, body: r.body, createdAt: r.createdAt.toISOString(), articleSlug: r.article.slug, articleTitle: r.article.title }));
}

export async function countApproved(articleId: string): Promise<number> {
  return prisma.articleComment.count({ where: { articleId, status: 'APPROVED' } });
}

// ---------------- Admin moderation (RBAC + audit) ----------------
export interface ModerationFilter { status?: CommentStatus; q?: string }

export async function listForModeration(a: Actor, filter?: ModerationFilter) {
  reqPerm(a, 'comment.view');
  const where: Prisma.ArticleCommentWhereInput = {};
  if (filter?.status) where.status = filter.status;
  if (filter?.q) where.body = { contains: filter.q, mode: 'insensitive' };
  const rows = await prisma.articleComment.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 200,
    include: { author: { select: { name: true, email: true } }, article: { select: { slug: true, title: true } } },
  });
  return rows.map((r) => ({
    id: r.id, status: r.status, body: r.body, createdAt: r.createdAt.toISOString(),
    author: r.author.name, authorEmail: r.author.email,
    articleSlug: r.article.slug, articleTitle: r.article.title, moderationReason: r.moderationReason,
  }));
}

export async function moderationCounts(a: Actor) {
  reqPerm(a, 'comment.view');
  const grouped = await prisma.articleComment.groupBy({ by: ['status'], _count: { _all: true } });
  const out: Record<string, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0, HIDDEN: 0 };
  for (const g of grouped) out[g.status] = g._count._all;
  return out;
}

export async function moderateComment(a: Actor, id: string, status: 'APPROVED' | 'REJECTED' | 'HIDDEN', reason?: string): Promise<void> {
  reqPerm(a, 'comment.moderate');
  const existing = await prisma.articleComment.findUnique({ where: { id }, select: { authorId: true, status: true } });
  if (!existing) throw new ServiceError('not_found', 'Comment not found.');
  if (status === 'APPROVED' && existing.authorId === a.id) throw new ServiceError('forbidden', 'You cannot approve your own comment.');
  await prisma.articleComment.update({
    where: { id },
    data: { status, moderatedById: a.id, moderatedAt: new Date(), moderationReason: reason?.slice(0, 300) || null },
  });
  await audit(a.id, `comment.${status.toLowerCase()}`, 'article_comment', id, `${existing.status} -> ${status}`);
}

export async function deleteComment(a: Actor, id: string): Promise<void> {
  reqPerm(a, 'comment.delete');
  await prisma.articleComment.delete({ where: { id } }).catch(() => { throw new ServiceError('not_found', 'Comment not found.'); });
  await audit(a.id, 'comment.delete', 'article_comment', id);
}
