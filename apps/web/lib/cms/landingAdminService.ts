import 'server-only';
import type { LandingEntityType, EntityFaq, EntitySeo } from '@prisma/client';
import { prisma } from '../db';
import { Actor } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import { assertEntityExists, requireEntityPerm } from './landingEntities';
import { getEntitySeo } from './entitySeoService';
import { listFaqsAdmin } from './faqService';
import { PRIMARY_SECTIONS, ROUTES } from '../../config/routes';
import { LEGACY_SLUGS } from './infoPageService';
import { listAssignableClassifications, type PublicClassification } from './disciplineClassificationService';

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
  VENUE: 'Venues', COMPETITOR: 'Competitors', SECTION: 'Primary Sections', SUBCATEGORY: 'Subcategories', INFO_PAGE: 'Information & Policy Pages',
};

export async function listLandingEntities(actor: Actor): Promise<LandingEntityGroup[]> {
  if (!canUseLandingManager(actor)) throw new ServiceError('forbidden', 'Not permitted to manage landing content.');
  const [hubs, events, editions, disciplines, categories, subcategories, infoPages, venues, competitors, seoRows, faqRows] = await Promise.all([
    prisma.rodeoHub.findMany({ orderBy: { title: 'asc' }, select: { id: true, title: true, slug: true } }),
    prisma.rodeoEvent.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true } }),
    prisma.rodeoEventEdition.findMany({ orderBy: [{ year: 'desc' }], select: { id: true, label: true, editionSlug: true, event: { select: { slug: true } } } }),
    prisma.discipline.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, slug: true } }),
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, slug: true } }),
    /**
     * Archived subcategories are listed too, deliberately. An archived archive
     * keeps its URL at HTTP 200 with `noindex`, so its SEO row still decides
     * what a search engine is told about a page that remains reachable.
     */
    prisma.subcategory.findMany({
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, name: true, slug: true, category: { select: { name: true } } },
    }),
    /*
      Archived info pages are listed too. An archived page keeps its row and may
      be restored, so its SEO row still describes a page that can come back —
      dropping it from this screen would hide settings that are still in force.
    */
    prisma.infoPage.findMany({
      orderBy: { slug: 'asc' },
      select: { id: true, slug: true, title: true, pageType: true, archivedAt: true },
    }),
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
    /**
     * The parent section is in the LABEL but not the URL. The flat route drops
     * it, and two sections can no longer share a slug, so the label is the only
     * place an operator can still see which section a subcategory belongs to.
     */
    {
      type: 'INFO_PAGE',
      label: GROUP_LABEL.INFO_PAGE,
      items: infoPages.map((ip) => row(
        'INFO_PAGE',
        ip.id,
        `${ip.title}${ip.archivedAt ? ' — archived' : ''}`,
        // A legacy policy slug is served from its own top-level route; anything
        // else lives under /info/. Matching `LegalPageView`'s own resolution.
        (LEGACY_SLUGS as readonly string[]).includes(ip.slug) ? `/${ip.slug}/` : `/info/${ip.slug}/`,
      )),
    },
    { type: 'SUBCATEGORY', label: GROUP_LABEL.SUBCATEGORY, items: subcategories.map((s) => row('SUBCATEGORY', s.id, `${s.name} — ${s.category.name}`, ROUTES.SUBCATEGORY(s.slug))) },
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
  /**
   * Editable discipline fields. Issue 03 added `name`, `image`, `imageCredit`
   * and the evergreen `guide` — previously the loader exposed four fields and
   * the guide JSON was unreachable from any admin screen, so eleven of the
   * thirteen fields the public page renders had no owner.
   */
  disciplineFields?: {
    shortName: string | null;
    /** LEGACY classification text, preserved. Read-only in the editor now. */
    category: string | null;
    /** Batch 05 — the managed classification reference, or null. */
    classificationId?: string | null;
    /**
     * What the Classification select offers: active classifications, plus this
     * discipline's current one even if it has been deactivated. Empty when the
     * managed table is absent, in which case the editor falls back to the
     * compatibility vocabulary.
     */
    classificationOptions?: PublicClassification[];
    tagline: string | null;
    summary: string;
    name: string;
    image: string | null;
    imageCredit: string | null;
    guide: {
      introduction?: string;
      competitionFormat?: string;
      stockProfile?: string;
      historicBenchmark?: string;
      scoringBreakdown?: { title: string; description: string }[];
      rulesHighlights?: string[];
      terminology?: { term: string; definition: string }[];
      beginnerTips?: string[];
    };
  };
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
  if (entityType === 'DISCIPLINE') {
    const d = await prisma.discipline.findUniqueOrThrow({
      where: { id: entityId },
      select: { name: true, slug: true, shortName: true, category: true, classificationId: true, tagline: true, summary: true, image: true, imageCredit: true, guide: true },
    });
    label = d.name;
    publicUrl = `/disciplines/${d.slug}/`;
    // The stored guide may be null (a discipline created from the admin) or a
    // JSON object. Anything that is not a plain object reads as empty rather
    // than crashing the editor; the write path still preserves the original.
    const guide = (d.guide && typeof d.guide === 'object' && !Array.isArray(d.guide)
      ? (d.guide as NonNullable<LandingDetail['disciplineFields']>['guide'])
      : {});
    disciplineFields = {
      shortName: d.shortName, category: d.category, tagline: d.tagline, summary: d.summary,
      name: d.name, image: d.image, imageCredit: d.imageCredit, guide,
      /**
       * Batch 05 — the managed classification reference, plus the options to
       * offer. `listAssignableClassifications(d.classificationId)` deliberately
       * includes this discipline's CURRENT classification even if it has since
       * been deactivated: otherwise the select renders with nothing chosen and
       * the next save silently clears a real assignment.
       */
      classificationId: d.classificationId,
      classificationOptions: await listAssignableClassifications(d.classificationId).catch(() => []),
    };
  }
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
