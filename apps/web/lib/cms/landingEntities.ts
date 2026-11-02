import 'server-only';
import type { LandingEntityType } from '@prisma/client';
import { prisma } from '../db';
import { roleHasPermission, type Permission } from '../auth/rbac';
import { Actor } from './guard';
import { ServiceError } from './articleService';

/**
 * Shared polymorphic-integrity helpers for Batch 11 EntitySeo / EntityFaq
 * (Safeguard 1). Every mutation is gated by the entity's owning permission AND an
 * existence check against the real table, so there are no orphan/cross-entity/invalid
 * associations. Orphan cleanup is performed by the owning entity's delete path
 * (see deleteEntitySeoForEntity / deleteFaqsForEntity wired into rodeoService +
 * taxonomy delete).
 */
export const LANDING_TYPES: LandingEntityType[] = ['DISCIPLINE', 'CATEGORY', 'RODEO_HUB', 'RODEO_EVENT', 'RODEO_EDITION', 'VENUE', 'COMPETITOR'];

/** Owning permission per landing entity (reuses existing RBAC — no new permissions).
 *  CATEGORY → taxonomy.manage; everything else (incl. Batch 12 VENUE/COMPETITOR) → rodeo.manage. */
export function permForEntity(t: LandingEntityType): Permission {
  return t === 'CATEGORY' ? 'taxonomy.manage' : 'rodeo.manage';
}

export function requireEntityPerm(actor: Actor, t: LandingEntityType): void {
  if (!roleHasPermission(actor.roles, permForEntity(t))) {
    throw new ServiceError('forbidden', `Not permitted to manage ${t} landing content.`);
  }
}

export async function entityExists(t: LandingEntityType, id: string): Promise<boolean> {
  switch (t) {
    case 'DISCIPLINE': return !!(await prisma.discipline.findUnique({ where: { id }, select: { id: true } }));
    case 'CATEGORY': return !!(await prisma.category.findUnique({ where: { id }, select: { id: true } }));
    case 'RODEO_HUB': return !!(await prisma.rodeoHub.findUnique({ where: { id }, select: { id: true } }));
    case 'RODEO_EVENT': return !!(await prisma.rodeoEvent.findUnique({ where: { id }, select: { id: true } }));
    case 'RODEO_EDITION': return !!(await prisma.rodeoEventEdition.findUnique({ where: { id }, select: { id: true } }));
    case 'VENUE': return !!(await prisma.venue.findUnique({ where: { id }, select: { id: true } }));
    case 'COMPETITOR': return !!(await prisma.competitor.findUnique({ where: { id }, select: { id: true } }));
    default: return false;
  }
}

export async function assertEntityExists(t: LandingEntityType, id: string): Promise<void> {
  if (!LANDING_TYPES.includes(t)) throw new ServiceError('validation', 'Unknown landing entity type.');
  if (!(await entityExists(t, id))) throw new ServiceError('not_found', `${t} ${id} not found`);
}
