import 'server-only';
import { z } from 'zod';
import type { LandingEntityType, EntityFaq, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { ServiceError } from './articleService';
import { requireEntityPerm, assertEntityExists } from './landingEntities';

/**
 * Entity-specific FAQ management (Batch 11, Safeguard 3). Public reads return only
 * enabled FAQs in deterministic order. Mutations require the entity's owning
 * permission + existence check + audit. Empty questions/answers are rejected and
 * duplicate questions within one entity are blocked (DB unique + case-insensitive
 * check). Structured data is emitted from exactly these enabled rows.
 */
export interface PublicFaq { id: string; question: string; answer: string }

export async function listPublicFaqs(entityType: LandingEntityType, entityId: string): Promise<PublicFaq[]> {
  const rows = await prisma.entityFaq.findMany({
    where: { entityType, entityId, enabled: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, question: true, answer: true },
  });
  return rows;
}

export async function listFaqsAdmin(actor: Actor, entityType: LandingEntityType, entityId: string): Promise<EntityFaq[]> {
  requireEntityPerm(actor, entityType);
  return prisma.entityFaq.findMany({ where: { entityType, entityId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
}

const FaqInput = z.object({
  question: z.string().trim().min(3).max(300),
  answer: z.string().trim().min(3).max(2000),
});
export type FaqInput = z.input<typeof FaqInput>;

async function assertNoDuplicate(entityType: LandingEntityType, entityId: string, question: string, exceptId?: string): Promise<void> {
  const rows = await prisma.entityFaq.findMany({ where: { entityType, entityId }, select: { id: true, question: true } });
  const q = question.trim().toLowerCase();
  if (rows.some((r) => r.question.trim().toLowerCase() === q && r.id !== exceptId)) {
    throw new ServiceError('conflict', 'A FAQ with that question already exists for this entity.');
  }
}

export async function createFaq(actor: Actor, entityType: LandingEntityType, entityId: string, raw: FaqInput): Promise<EntityFaq> {
  requireEntityPerm(actor, entityType);
  await assertEntityExists(entityType, entityId);
  const v = FaqInput.parse(raw);
  await assertNoDuplicate(entityType, entityId, v.question);
  const max = await prisma.entityFaq.aggregate({ _max: { sortOrder: true }, where: { entityType, entityId } });
  const faq = await prisma.entityFaq.create({
    data: { entityType, entityId, question: v.question, answer: v.answer, sortOrder: (max._max.sortOrder ?? -1) + 1, createdById: actor.id, updatedById: actor.id },
  });
  await audit(actor.id, 'entity.faq.create', 'entity_faq', faq.id, `${entityType}:${entityId}`);
  return faq;
}

export async function updateFaq(actor: Actor, id: string, raw: FaqInput): Promise<EntityFaq> {
  const existing = await prisma.entityFaq.findUnique({ where: { id } });
  if (!existing) throw new ServiceError('not_found', 'FAQ not found');
  requireEntityPerm(actor, existing.entityType);
  const v = FaqInput.parse(raw);
  await assertNoDuplicate(existing.entityType, existing.entityId, v.question, id);
  const faq = await prisma.entityFaq.update({ where: { id }, data: { question: v.question, answer: v.answer, updatedById: actor.id } });
  await audit(actor.id, 'entity.faq.update', 'entity_faq', id);
  return faq;
}

export async function setFaqEnabled(actor: Actor, id: string, enabled: boolean): Promise<void> {
  const existing = await prisma.entityFaq.findUnique({ where: { id }, select: { entityType: true } });
  if (!existing) throw new ServiceError('not_found', 'FAQ not found');
  requireEntityPerm(actor, existing.entityType);
  await prisma.entityFaq.update({ where: { id }, data: { enabled, updatedById: actor.id } });
  await audit(actor.id, 'entity.faq.enabled', 'entity_faq', id, enabled ? 'enabled' : 'disabled');
}

export async function deleteFaq(actor: Actor, id: string): Promise<void> {
  const existing = await prisma.entityFaq.findUnique({ where: { id }, select: { entityType: true } });
  if (!existing) throw new ServiceError('not_found', 'FAQ not found');
  requireEntityPerm(actor, existing.entityType);
  await prisma.entityFaq.delete({ where: { id } });
  await audit(actor.id, 'entity.faq.delete', 'entity_faq', id);
}

/** Deterministic reorder: assigns sortOrder by the given id order. All ids must belong
 * to the same entity (prevents cross-entity mutation). */
export async function reorderFaqs(actor: Actor, entityType: LandingEntityType, entityId: string, orderedIds: string[]): Promise<void> {
  requireEntityPerm(actor, entityType);
  const rows = await prisma.entityFaq.findMany({ where: { entityType, entityId }, select: { id: true } });
  const owned = new Set(rows.map((r) => r.id));
  if (orderedIds.length !== owned.size || !orderedIds.every((id) => owned.has(id))) {
    throw new ServiceError('validation', 'Reorder list must contain exactly this entity’s FAQ ids.');
  }
  await prisma.$transaction(orderedIds.map((id, i) => prisma.entityFaq.update({ where: { id }, data: { sortOrder: i } })) as unknown as Prisma.PrismaPromise<unknown>[]);
  await audit(actor.id, 'entity.faq.reorder', 'entity_faq', `${entityType}:${entityId}`, `${orderedIds.length} items`);
}

/** Internal cleanup — called from the owning entity's delete path to avoid orphans. */
export async function deleteFaqsForEntity(entityType: LandingEntityType, entityId: string): Promise<void> {
  await prisma.entityFaq.deleteMany({ where: { entityType, entityId } });
}
