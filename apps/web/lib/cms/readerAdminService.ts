import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { Permission, roleHasPermission } from '../auth/rbac';
import { READER_ROLE_KEY } from '../auth/reader';
import { ServiceError } from './articleService';

/**
 * Reader-account administration (Batch 24). Admin/Super Admin only, default-deny + audited.
 *
 * SCOPE GUARANTEE: every function operates ONLY on users who hold the `reader` role and
 * hold NO staff (CMS-capable) role. A staff account can never be listed, suspended, or
 * deleted from here — that path is the Team module. This keeps reader management from
 * becoming a backdoor to disabling administrators.
 */
const need = (a: Actor, p: Permission) => { if (!roleHasPermission(a.roles, p)) throw new ServiceError('forbidden', `Missing permission: ${p}`); };

/** A user is a manageable "reader" iff it has the reader role and no staff role. */
const READER_ONLY_WHERE: Prisma.UserWhereInput = {
  roles: { some: { role: { key: READER_ROLE_KEY } } },
  // Exclude anyone who also holds a staff role (defense-in-depth; readers never do).
  NOT: { roles: { some: { role: { key: { in: ['super_admin', 'administrator', 'editor', 'author', 'seo_manager'] } } } } },
};

export interface ReaderRow {
  id: string; name: string; email: string; status: string;
  emailVerified: boolean; createdAt: string; lastLoginAt: string | null;
  commentCount: number; activeSessions: number;
}

function toRow(u: {
  id: string; name: string; email: string; status: string; emailVerifiedAt: Date | null;
  createdAt: Date; lastLoginAt: Date | null; _count: { comments: number; sessions: number };
}): ReaderRow {
  return {
    id: u.id, name: u.name, email: u.email, status: u.status,
    emailVerified: !!u.emailVerifiedAt,
    createdAt: u.createdAt.toISOString(), lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    commentCount: u._count.comments, activeSessions: u._count.sessions,
  };
}

export interface ReaderFilters { q?: string; status?: string }

export async function listReaders(actor: Actor, filters: ReaderFilters = {}): Promise<ReaderRow[]> {
  need(actor, 'reader.view');
  const where: Prisma.UserWhereInput = { ...READER_ONLY_WHERE };
  if (filters.q) where.OR = [{ name: { contains: filters.q, mode: 'insensitive' } }, { email: { contains: filters.q, mode: 'insensitive' } }];
  if (filters.status && ['ACTIVE', 'SUSPENDED'].includes(filters.status)) where.status = filters.status as never;
  const rows = await prisma.user.findMany({
    where, orderBy: { createdAt: 'desc' }, take: 300,
    select: {
      id: true, name: true, email: true, status: true, emailVerifiedAt: true,
      createdAt: true, lastLoginAt: true,
      _count: { select: { comments: true, sessions: true } },
    },
  });
  return rows.map(toRow);
}

export async function readerCounts(actor: Actor): Promise<{ total: number; active: number; suspended: number }> {
  need(actor, 'reader.view');
  const [total, active, suspended] = await Promise.all([
    prisma.user.count({ where: READER_ONLY_WHERE }),
    prisma.user.count({ where: { ...READER_ONLY_WHERE, status: 'ACTIVE' } }),
    prisma.user.count({ where: { ...READER_ONLY_WHERE, status: 'SUSPENDED' } }),
  ]);
  return { total, active, suspended };
}

/** A single reader plus their comment history (all statuses). */
export async function readerDetail(actor: Actor, id: string) {
  need(actor, 'reader.view');
  await assertManageableReader(id);
  const comments = await prisma.articleComment.findMany({
    where: { authorId: id }, orderBy: { createdAt: 'desc' }, take: 100,
    include: { article: { select: { slug: true, title: true } } },
  });
  return comments.map((c) => ({
    id: c.id, status: c.status, body: c.body, createdAt: c.createdAt.toISOString(),
    articleSlug: c.article.slug, articleTitle: c.article.title,
  }));
}

/** Throws unless `id` is a reader-only account (reader role, no staff role). */
async function assertManageableReader(id: string): Promise<void> {
  const u = await prisma.user.findFirst({ where: { id, ...READER_ONLY_WHERE }, select: { id: true } });
  if (!u) {
    // Distinguish "no such reader" from "exists but is staff" without leaking much.
    const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    throw exists
      ? new ServiceError('forbidden', 'That account is a staff member — manage it in the Team module.')
      : new ServiceError('not_found', 'Reader not found.');
  }
}

export async function setReaderStatus(actor: Actor, id: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<void> {
  need(actor, 'reader.manage');
  await assertManageableReader(id);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { status } });
    if (status === 'SUSPENDED') await tx.session.deleteMany({ where: { userId: id } }); // force logout immediately
  });
  await audit(actor.id, 'reader.status.set', 'user', id, status);
}

export async function revokeReaderSessions(actor: Actor, id: string): Promise<{ revoked: number }> {
  need(actor, 'reader.manage');
  await assertManageableReader(id);
  const r = await prisma.session.deleteMany({ where: { userId: id } });
  await audit(actor.id, 'reader.sessions.revoke', 'user', id, `count=${r.count}`);
  return { revoked: r.count };
}

/** Permanently delete a reader account. Cascades to their comments, tokens and sessions
 *  (schema FKs are onDelete: Cascade). Admin-initiated + audited. */
export async function deleteReader(actor: Actor, id: string): Promise<void> {
  need(actor, 'reader.manage');
  await assertManageableReader(id);
  await prisma.user.delete({ where: { id } });
  await audit(actor.id, 'reader.delete', 'user', id);
}
