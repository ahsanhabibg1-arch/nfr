import 'server-only';
import { z } from 'zod';
import { Prisma, SourceClassification, SourceStatus } from '@prisma/client';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { isSafeHref } from '../url';
import { ServiceError } from './articleService';

/** Sources & References management (Batch 04 §10). Requires `source.manage` for mutations. */

const requireManage = (actor: Actor) => {
  if (!roleHasPermission(actor.roles, 'source.manage')) throw new ServiceError('forbidden', 'Not permitted to manage sources');
};

const CLASS: Record<string, SourceClassification> = {
  official: 'OFFICIAL', independent: 'INDEPENDENT_REFERENCE', historical: 'HISTORICAL_ARCHIVE',
};

const SourceInput = z.object({
  title: z.string().min(1).max(300),
  url: z.string().min(1).max(600),
  publisher: z.string().max(200).optional(),
  type: z.string().max(80).optional(),
  classification: z.enum(['official', 'independent', 'historical']).default('independent'),
  note: z.string().max(1000).optional(),
});
export type SourceInput = z.input<typeof SourceInput>;

export interface SourceRow {
  id: string; title: string; url: string; publisher: string | null; type: string | null;
  classification: SourceClassification; status: SourceStatus; verificationDate: string | null; linkedArticles: number;
}

export async function listSources(params: { q?: string; status?: string } = {}): Promise<SourceRow[]> {
  const where: Prisma.SourceWhereInput = {};
  if (params.q) where.OR = [{ title: { contains: params.q, mode: 'insensitive' } }, { publisher: { contains: params.q, mode: 'insensitive' } }, { url: { contains: params.q, mode: 'insensitive' } }];
  if (params.status && ['VERIFIED', 'NEEDS_REVIEW', 'EXPIRED'].includes(params.status)) where.status = params.status as SourceStatus;
  const rows = await prisma.source.findMany({ where, orderBy: { title: 'asc' }, include: { _count: { select: { articles: true } } }, take: 200 });
  return rows.map((s) => ({
    id: s.id, title: s.title, url: s.url, publisher: s.publisher, type: s.type,
    classification: s.classification, status: s.status,
    verificationDate: s.verificationDate ? s.verificationDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null,
    linkedArticles: s._count.articles,
  }));
}

export async function createSource(actor: Actor, raw: SourceInput): Promise<{ id: string }> {
  requireManage(actor);
  const v = SourceInput.parse(raw);
  if (!isSafeHref(v.url)) throw new ServiceError('validation', 'Source URL must use a safe protocol (http/https/mailto/tel).');
  const s = await prisma.source.create({
    data: { title: v.title, url: v.url, publisher: v.publisher ?? null, type: v.type ?? null, classification: CLASS[v.classification], status: 'NEEDS_REVIEW' },
  });
  await audit(actor.id, 'source.create', 'source', s.id, v.title);
  return { id: s.id };
}

export async function updateSource(actor: Actor, id: string, raw: SourceInput): Promise<{ id: string }> {
  requireManage(actor);
  const v = SourceInput.parse(raw);
  if (!isSafeHref(v.url)) throw new ServiceError('validation', 'Source URL must use a safe protocol.');
  const existing = await prisma.source.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ServiceError('not_found', 'Source not found');
  await prisma.source.update({ where: { id }, data: { title: v.title, url: v.url, publisher: v.publisher ?? null, type: v.type ?? null, classification: CLASS[v.classification] } });
  await audit(actor.id, 'source.update', 'source', id, v.title);
  return { id };
}

/** Mark verified/needs-review. verificationDate is set to the actual time of the editorial action (§10 — never fabricated). */
export async function setSourceStatus(actor: Actor, id: string, status: 'VERIFIED' | 'NEEDS_REVIEW' | 'EXPIRED'): Promise<void> {
  requireManage(actor);
  const existing = await prisma.source.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ServiceError('not_found', 'Source not found');
  await prisma.source.update({ where: { id }, data: { status, verificationDate: status === 'VERIFIED' ? new Date() : null } });
  await audit(actor.id, 'source.status', 'source', id, status);
}

/** Referential protection: refuse to delete a source still cited by articles (§7/§10). */
export async function deleteSource(actor: Actor, id: string): Promise<void> {
  requireManage(actor);
  const linked = await prisma.articleSource.count({ where: { sourceId: id } });
  if (linked > 0) throw new ServiceError('conflict', `Cannot delete: this source is cited by ${linked} article(s). Detach it first.`);
  await prisma.source.delete({ where: { id } }).catch(() => { throw new ServiceError('not_found', 'Source not found'); });
  await audit(actor.id, 'source.delete', 'source', id);
}
