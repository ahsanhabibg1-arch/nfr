import 'server-only';
import type { LandingEntityType, EntityFaq, EntitySeo } from '@prisma/client';
import { prisma } from '../db';
import { Actor } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import { assertEntityExists, requireEntityPerm } from './landingEntities';
import { getEntitySeo } from './entitySeoService';
import { listFaqsAdmin } from './faqService';
import { PRIMARY_SECTIONS } from '../../config/routes';

/**
 * Read model for the Landing-Page SEO & FAQ admin manager (Batch 11). Listing requires
 * either landing permission (rodeo.manage or taxonomy.manage); per-entity editing is
 * still enforced by the services. Public URL + label are computed for the UI.
 */
export function canUseLandingManager(actor: Actor): boolean {
  return roleHasPermission(actor.roles, 'rodeo.manage') || roleHasPermission(actor.roles, 'taxonomy.manage');
}

export interface LandingEntityRow {
  entityType: LandingEntityType;
  entityId: string;
  label: string;
  publicUrl: string;
  hasSeo: boolean;
  noindex: boolean;
  faqCount: number;
}
export interface LandingEntityGroup { type: LandingEntityType; label: string; items: LandingEntityRow[] }

const GROUP_LABEL: Record<LandingEntityType, string> = {
  RODEO_HUB: 'Rodeo Hubs', RODEO_EVENT: 'Rodeo Events', RODEO_EDITION: 'Event Editions', DISCIPLINE: 'Disciplines', CATEGORY: 'Categories',
  VENUE: 'Venues', COMPETITOR: 'Competitors', SECTION: 'Primary Sections',
};

export async function listLandingEntities(actor: Actor): Promise<LandingEntityGroup[]> {
  if (!canUseLandingManager(actor)) throw new ServiceError('forbidden', 'Not permitted to manage landing content.');
  const [hubs, events, editions, disciplines, categories, venues, competitors, seoRows, faqRows] = await Promise.all([
    prisma.rodeoHub.findMany({ orderBy: { title: 'asc' }, select: { id: true, title: true, slug: true } }),
    prisma.rodeoEvent.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true } }),
    prisma.rodeoEventEdition.findMany({ orderBy: [{ year: 'desc' }], select: { id: true, label: true, editionSlug: true, event: { select: { slug: true } } } }),
    prisma.discipline.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, slug: true } }),
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, slug: true } }),
    prisma.venue.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true } }),
    prisma.competitor.findMany({ orderBy: [{ sortOrder: 'asc' }, { fullName: 'asc' }], select: { id: true, fullName: true, slug: true } }),
    prisma.entitySeo.findMany({ select: { entityType: true, entityId: true, noindex: true } }),
    prisma.entityFaq.groupBy({ by: ['entityType', 'entityId'], _count: { _all: true } }),
  ]);
  const seoBy = new Map(seoRows.map((s) => [`${s.entityType}:${s.entityId}`, s]));
  const faqBy = new Map(faqRows.map((f) => [`${f.entityType}:${f.entityId}`, f._count._all]));
  const row = (entityType: LandingEntityType, entityId: string, label: string, publicUrl: string): LandingEntityRow => {
    const seo = seoBy.get(`${entityType}:${entityId}`);
    return { entityType, entityId, label, publicUrl, hasSeo: !!seo, noindex: !!seo?.noindex, faqCount: faqBy.get(`${entityType}:${entityId}`) ?? 0 };
  };
  return [
    { type: 'RODEO_HUB', label: GROUP_LABEL.RODEO_HUB, items: hubs.map((h) => row('RODEO_HUB', h.id, h.title, `/rodeo-events/${h.slug}/`)) },
    { type: 'RODEO_EVENT', label: GROUP_LABEL.RODEO_EVENT, items: events.map((e) => row('RODEO_EVENT', e.id, e.name, `/rodeo-events/${e.slug}/`)) },
    { type: 'RODEO_EDITION', label: GROUP_LABEL.RODEO_EDITION, items: editions.map((e) => row('RODEO_EDITION', e.id, e.label, `/rodeo-events/${e.event.slug}/${e.editionSlug}/`)) },
    { type: 'DISCIPLINE', label: GROUP_LABEL.DISCIPLINE, items: disciplines.map((d) => row('DISCIPLINE', d.id, d.name, `/disciplines/${d.slug}/`)) },
    { type: 'CATEGORY', label: GROUP_LABEL.CATEGORY, items: categories.map((c) => row('CATEGORY', c.id, c.name, `/categories/${c.slug}/`)) },
    { type: 'VENUE', label: GROUP_LABEL.VENUE, items: venues.map((v) => row('VENUE', v.id, v.name, `/venues/${v.slug}/`)) },
    { type: 'COMPETITOR', label: GROUP_LABEL.COMPETITOR, items: competitors.map((c) => row('COMPETITOR', c.id, c.fullName, `/competitors/${c.slug}/`)) },
    { type: 'SECTION', label: GROUP_LABEL.SECTION, items: Object.values(PRIMARY_SECTIONS).map((s) => row('SECTION', s.id, s.name, s.path)) },
  ];
}

export interface LandingDetail {
  entityType: LandingEntityType;
  entityId: string;
  label: string;
  publicUrl: string;
  canEdit: boolean;
  seo: EntitySeo | null;
  faqs: EntityFaq[];
  /** Editable core fields for disciplines (Batch 11); deep guide JSON is not exposed. */
  disciplineFields?: { shortName: string | null; category: string | null; tagline: string | null; summary: string };
}

export async function getLandingDetail(actor: Actor, entityType: LandingEntityType, entityId: string): Promise<LandingDetail> {
  if (!canUseLandingManager(actor)) throw new ServiceError('forbidden', 'Not permitted to manage landing content.');
  await assertEntityExists(entityType, entityId);
  // Resolve label + public URL for the chosen entity.
  let label = entityId;
  let publicUrl = '#';
  if (entityType === 'RODEO_HUB') { const h = await prisma.rodeoHub.findUniqueOrThrow({ where: { id: entityId }, select: { title: true, slug: true } }); label = h.title; publicUrl = `/rodeo-events/${h.slug}/`; }
  else if (entityType === 'RODEO_EVENT') { const e = await prisma.rodeoEvent.findUniqueOrThrow({ where: { id: entityId }, select: { name: true, slug: true } }); label = e.name; publicUrl = `/rodeo-events/${e.slug}/`; }
  else if (entityType === 'RODEO_EDITION') { const e = await prisma.rodeoEventEdition.findUniqueOrThrow({ where: { id: entityId }, select: { label: true, editionSlug: true, event: { select: { slug: true } } } }); label = e.label; publicUrl = `/rodeo-events/${e.event.slug}/${e.editionSlug}/`; }
  let disciplineFields: LandingDetail['disciplineFields'];
  if (entityType === 'DISCIPLINE') { const d = await prisma.discipline.findUniqueOrThrow({ where: { id: entityId }, select: { name: true, slug: true, shortName: true, category: true, tagline: true, summary: true } }); label = d.name; publicUrl = `/disciplines/${d.slug}/`; disciplineFields = { shortName: d.shortName, category: d.category, tagline: d.tagline, summary: d.summary }; }
  else if (entityType === 'CATEGORY') { const c = await prisma.category.findUniqueOrThrow({ where: { id: entityId }, select: { name: true, slug: true } }); label = c.name; publicUrl = `/categories/${c.slug}/`; }
  else if (entityType === 'VENUE') { const v = await prisma.venue.findUniqueOrThrow({ where: { id: entityId }, select: { name: true, slug: true } }); label = v.name; publicUrl = `/venues/${v.slug}/`; }
  else if (entityType === 'COMPETITOR') { const c = await prisma.competitor.findUniqueOrThrow({ where: { id: entityId }, select: { fullName: true, slug: true } }); label = c.fullName; publicUrl = `/competitors/${c.slug}/`; }
  else if (entityType === 'SECTION') { const s = PRIMARY_SECTIONS[entityId]; if (s) { label = s.name; publicUrl = s.path; } }
  // canEdit = holds the entity's owning permission.
  let canEdit = true;
  try { requireEntityPerm(actor, entityType); } catch { canEdit = false; }
  const [seo, faqs] = await Promise.all([getEntitySeo(entityType, entityId), listFaqsAdmin(actor, entityType, entityId).catch(() => [])]);
  return { entityType, entityId, label, publicUrl, canEdit, seo, faqs, disciplineFields };
}
