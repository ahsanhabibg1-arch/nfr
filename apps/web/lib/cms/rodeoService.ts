import 'server-only';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import { deleteEntitySeoForEntity } from './entitySeoService';
import { deleteFaqsForEntity } from './faqService';
import { DISCIPLINE_CLASSIFICATIONS } from '../content/disciplineClassifications';

/** Remove polymorphic SEO/FAQ rows when an owning entity is deleted (Batch 11/12). */
async function cleanupLandingRows(entityType: 'RODEO_HUB' | 'RODEO_EVENT' | 'RODEO_EDITION' | 'DISCIPLINE' | 'CATEGORY' | 'VENUE', id: string): Promise<void> {
  await deleteEntitySeoForEntity(entityType, id);
  await deleteFaqsForEntity(entityType, id);
}

/**
 * Rodeo Coverage management (Batch 04 §6/§7). Requires `rodeo.manage`.
 * Preserves the recurring-event vs annual-edition distinction and uses
 * restrict-on-delete for entities referenced by articles/editions (no silent
 * cascade of published editorial content). Disciplines are read-only here
 * (foundational). No fabricated dates/results/purses.
 */
const req = (a: Actor) => { if (!roleHasPermission(a.roles, 'rodeo.manage')) throw new ServiceError('forbidden', 'Not permitted to manage rodeo coverage'); };
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/**
 * Batch 10: hubs and recurring events share the public `/rodeo-events/<slug>/`
 * namespace, so their slugs must be unique ACROSS both tables (Postgres cannot
 * express a cross-table unique constraint, so this is enforced at write time; slugs
 * are immutable after create, so only creates need the check). See
 * scripts/rodeo-slug-scan.mts for a one-time collision audit.
 */
async function assertRodeoSlugFree(slug: string): Promise<void> {
  const [hub, event] = await Promise.all([
    prisma.rodeoHub.findUnique({ where: { slug }, select: { id: true } }),
    prisma.rodeoEvent.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  if (hub || event) throw new ServiceError('conflict', `The URL slug "${slug}" is already used by another rodeo hub or event.`);
}

// ---- Hubs ----
export interface HubRow { id: string; slug: string; title: string; region: string | null; circuitType: string | null; articleCount: number; archivedAt: Date | null; }
export async function listHubs(): Promise<HubRow[]> {
  const rows = await prisma.rodeoHub.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { articles: true } } } });
  return rows.map((h) => ({ id: h.id, slug: h.slug, title: h.title, region: h.region, circuitType: h.circuitType, articleCount: h._count.articles, archivedAt: h.archivedAt }));
}
const HubInput = z.object({ title: z.string().min(1).max(200), region: z.string().max(120).optional(), circuitType: z.string().max(120).optional(), description: z.string().max(1000).optional() });
export type HubInput = z.input<typeof HubInput>;
export async function createHub(a: Actor, raw: HubInput): Promise<{ id: string }> {
  req(a); const v = HubInput.parse(raw); const id = `hub-${slugify(v.title)}`;
  if (await prisma.rodeoHub.findUnique({ where: { id } })) throw new ServiceError('conflict', 'A hub with that name exists.');
  await assertRodeoSlugFree(slugify(v.title));
  await prisma.rodeoHub.create({ data: { id, slug: slugify(v.title), title: v.title, region: v.region ?? null, circuitType: v.circuitType ?? null, description: v.description ?? null } });
  await audit(a.id, 'rodeo.hub.create', 'rodeo_hub', id, v.title); return { id };
}
export async function updateHub(a: Actor, id: string, raw: HubInput): Promise<void> {
  req(a); const v = HubInput.parse(raw);
  if (!(await prisma.rodeoHub.findUnique({ where: { id } }))) throw new ServiceError('not_found', 'Hub not found');
  await prisma.rodeoHub.update({ where: { id }, data: { title: v.title, region: v.region ?? null, circuitType: v.circuitType ?? null, description: v.description ?? null } });
  await audit(a.id, 'rodeo.hub.update', 'rodeo_hub', id, v.title);
}
export async function deleteHub(a: Actor, id: string): Promise<void> {
  req(a); const linked = await prisma.articleHub.count({ where: { hubId: id } });
  if (linked > 0) throw new ServiceError('conflict', `Cannot delete: ${linked} article(s) reference this hub.`);
  await prisma.rodeoHub.delete({ where: { id } }).catch(() => { throw new ServiceError('not_found', 'Hub not found'); });
  await cleanupLandingRows('RODEO_HUB', id);
  await audit(a.id, 'rodeo.hub.delete', 'rodeo_hub', id);
}

// ---- Recurring Events ----
export interface EventRow { id: string; slug: string; name: string; location: string | null; status: string | null; isFlagship: boolean; editionCount: number; articleCount: number; archivedAt: Date | null; }
export async function listEvents(): Promise<EventRow[]> {
  const rows = await prisma.rodeoEvent.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { editions: true, articles: true } } } });
  return rows.map((e) => ({ id: e.id, slug: e.slug, name: e.name, location: e.location, status: e.status, isFlagship: e.isFlagship, editionCount: e._count.editions, articleCount: e._count.articles, archivedAt: e.archivedAt }));
}
const EventInput = z.object({ name: z.string().min(1).max(200), location: z.string().max(160).optional(), status: z.string().max(80).optional(), description: z.string().max(1000).optional(), organizerName: z.string().max(200).optional(), isFlagship: z.boolean().optional() });
export type EventInput = z.input<typeof EventInput>;
export async function createEvent(a: Actor, raw: EventInput): Promise<{ id: string }> {
  req(a); const v = EventInput.parse(raw); const id = `event-${slugify(v.name)}`;
  if (await prisma.rodeoEvent.findUnique({ where: { id } })) throw new ServiceError('conflict', 'An event with that name exists.');
  await assertRodeoSlugFree(slugify(v.name));
  await prisma.rodeoEvent.create({ data: { id, slug: slugify(v.name), name: v.name, location: v.location ?? null, status: v.status ?? null, description: v.description ?? null, organizerName: v.organizerName ?? null, isFlagship: v.isFlagship ?? false } });
  await audit(a.id, 'rodeo.event.create', 'rodeo_event', id, v.name); return { id };
}
export async function updateEvent(a: Actor, id: string, raw: EventInput): Promise<void> {
  req(a); const v = EventInput.parse(raw);
  if (!(await prisma.rodeoEvent.findUnique({ where: { id } }))) throw new ServiceError('not_found', 'Event not found');
  await prisma.rodeoEvent.update({ where: { id }, data: { name: v.name, location: v.location ?? null, status: v.status ?? null, description: v.description ?? null, organizerName: v.organizerName ?? null, isFlagship: v.isFlagship ?? false } });
  await audit(a.id, 'rodeo.event.update', 'rodeo_event', id, v.name);
}
export async function deleteEvent(a: Actor, id: string): Promise<void> {
  req(a);
  const [editions, articles] = await Promise.all([prisma.rodeoEventEdition.count({ where: { eventId: id } }), prisma.articleEvent.count({ where: { eventId: id } })]);
  if (editions > 0) throw new ServiceError('conflict', `Cannot delete: remove its ${editions} edition(s) first.`);
  if (articles > 0) throw new ServiceError('conflict', `Cannot delete: ${articles} article(s) reference this event.`);
  await prisma.rodeoEvent.delete({ where: { id } }).catch(() => { throw new ServiceError('not_found', 'Event not found'); });
  await cleanupLandingRows('RODEO_EVENT', id);
  await audit(a.id, 'rodeo.event.delete', 'rodeo_event', id);
}

// ---- Event Editions (unique per event+editionSlug) ----
export interface EditionRow { id: string; eventId: string; eventName: string; eventSlug: string; editionSlug: string; label: string; year: number | null; purseBenchmark: string | null; venueName: string | null; articleCount: number; archivedAt: Date | null; }
export async function listEditions(): Promise<EditionRow[]> {
  const rows = await prisma.rodeoEventEdition.findMany({ orderBy: [{ eventId: 'asc' }, { editionSlug: 'desc' }], include: { event: { select: { name: true, slug: true } }, venue: { select: { name: true } }, _count: { select: { articles: true } } } });
  return rows.map((ed) => ({ id: ed.id, eventId: ed.eventId, eventName: ed.event.name, eventSlug: ed.event.slug, editionSlug: ed.editionSlug, label: ed.label, year: ed.year, purseBenchmark: ed.purseBenchmark, venueName: ed.venue?.name ?? null, articleCount: ed._count.articles, archivedAt: ed.archivedAt }));
}
const EditionInput = z.object({ eventId: z.string().min(1), editionSlug: z.string().min(1).max(60), label: z.string().min(1).max(200), year: z.number().int().optional(), purseBenchmark: z.string().max(120).optional(), venueId: z.string().optional() });
export type EditionInput = z.input<typeof EditionInput>;
export async function createEdition(a: Actor, raw: EditionInput): Promise<{ id: string }> {
  req(a); const v = EditionInput.parse(raw);
  if (!(await prisma.rodeoEvent.findUnique({ where: { id: v.eventId } }))) throw new ServiceError('validation', 'Parent event not found.');
  if (await prisma.rodeoEventEdition.findFirst({ where: { eventId: v.eventId, editionSlug: v.editionSlug } })) throw new ServiceError('conflict', 'That edition already exists for this event.');
  const ed = await prisma.rodeoEventEdition.create({ data: { eventId: v.eventId, editionSlug: v.editionSlug, label: v.label, year: v.year ?? null, purseBenchmark: v.purseBenchmark ?? null, venueId: v.venueId || null } });
  await audit(a.id, 'rodeo.edition.create', 'event_edition', ed.id, v.label); return { id: ed.id };
}
export async function updateEdition(a: Actor, id: string, raw: Omit<EditionInput, 'eventId' | 'editionSlug'>): Promise<void> {
  req(a); const v = z.object({ label: z.string().min(1).max(200), year: z.number().int().optional(), purseBenchmark: z.string().max(120).optional(), venueId: z.string().optional() }).parse(raw);
  if (!(await prisma.rodeoEventEdition.findUnique({ where: { id } }))) throw new ServiceError('not_found', 'Edition not found');
  await prisma.rodeoEventEdition.update({ where: { id }, data: { label: v.label, year: v.year ?? null, purseBenchmark: v.purseBenchmark ?? null, venueId: v.venueId || null } });
  await audit(a.id, 'rodeo.edition.update', 'event_edition', id, v.label);
}
/**
 * Dependencies that block deleting an edition, with the counts an operator needs
 * in order to act. Exported so the Admin UI can WARN before the operator clicks,
 * rather than only explaining after the attempt fails.
 */
export interface EditionDependencies {
  articles: number;
  sessions: number;
  results: number;
  standings: number;
  competitors: number;
  total: number;
}
export async function getEditionDependencies(id: string): Promise<EditionDependencies> {
  const [articles, sessions, results, standings, competitors] = await Promise.all([
    prisma.articleEdition.count({ where: { editionId: id } }),
    prisma.competitionSession.count({ where: { editionId: id } }),
    prisma.competitionResult.count({ where: { editionId: id } }),
    prisma.competitionStanding.count({ where: { editionId: id } }),
    prisma.competitorParticipation.count({ where: { editionId: id } }),
  ]);
  return { articles, sessions, results, standings, competitors, total: articles + sessions + results + standings + competitors };
}

export async function deleteEdition(a: Actor, id: string): Promise<void> {
  req(a);
  /**
   * DATA-INTEGRITY FIX (Rodeo Coverage admin audit).
   *
   * This previously checked linked articles and nothing else, while FIVE tables
   * reference an edition and every one of them is `onDelete: Cascade` in the
   * schema: `CompetitionSession`, `CompetitionResult`, `CompetitionStanding`,
   * `CompetitorParticipation` and `RodeoEventEditionMedia`. An edition holding a
   * full year of verified competition history therefore deleted cleanly and took
   * all of it with it, with no warning, because no dependency was computed.
   *
   * The sibling guard on `deleteEvent` did not help: it refuses only while
   * editions exist, so deleting the editions first destroyed the same records one
   * level down.
   *
   * Verified results, schedules and standings are historical facts that cannot be
   * reconstructed from the CMS, so deletion is REFUSED rather than cascaded, and
   * the message names what to remove first. This matches the established pattern
   * for events and venues, and needs no schema change.
   *
   * Media is deliberately NOT counted: `RodeoEventEditionMedia` rows are
   * attachments of this edition, carry no independent history, and blocking on
   * them would make an otherwise-empty edition undeletable.
   */
  const dep = await getEditionDependencies(id);
  if (dep.total > 0) {
    const parts: string[] = [];
    if (dep.articles) parts.push(`${dep.articles} article(s)`);
    if (dep.sessions) parts.push(`${dep.sessions} scheduled session(s)`);
    if (dep.results) parts.push(`${dep.results} recorded result(s)`);
    if (dep.standings) parts.push(`${dep.standings} standing(s)`);
    if (dep.competitors) parts.push(`${dep.competitors} competitor participation record(s)`);
    throw new ServiceError(
      'conflict',
      `Cannot delete: this edition still has ${parts.join(', ')}. ` +
        'Competition history is not recreatable — remove or reassign these records first.',
    );
  }
  await prisma.rodeoEventEdition.delete({ where: { id } }).catch(() => { throw new ServiceError('not_found', 'Edition not found'); });
  await cleanupLandingRows('RODEO_EDITION', id);
  await audit(a.id, 'rodeo.edition.delete', 'event_edition', id);
}

// ---- Venues ----
export interface VenueRow { id: string; slug: string; name: string; city: string | null; state: string | null; editionCount: number; archivedAt: Date | null; }
export async function listVenues(): Promise<VenueRow[]> {
  const rows = await prisma.venue.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { editions: true } } } });
  return rows.map((v) => ({ id: v.id, slug: v.slug, name: v.name, city: v.city, state: v.state, editionCount: v._count.editions, archivedAt: v.archivedAt }));
}
/// Full editable venue rows for the dedicated Batch 12 Venue CMS.
export interface VenueFullRow {
  id: string; slug: string; name: string; nickname: string | null; summary: string | null; description: string | null;
  websiteUrl: string | null; capacity: number | null; openedYear: number | null; latitude: number | null; longitude: number | null;
  city: string | null; state: string | null; country: string | null; editionCount: number;
}
export async function listVenuesFull(): Promise<VenueFullRow[]> {
  const rows = await prisma.venue.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { editions: true } } } });
  return rows.map((v) => ({
    id: v.id, slug: v.slug, name: v.name, nickname: v.nickname, summary: v.summary, description: v.description,
    websiteUrl: v.websiteUrl, capacity: v.capacity, openedYear: v.openedYear, latitude: v.latitude, longitude: v.longitude,
    city: v.city, state: v.state, country: v.country, editionCount: v._count.editions,
  }));
}
/// Batch 12: richer Venue fields (all optional; validated; never fabricated). Slug is
/// derived from the name on create and immutable thereafter.
const currentYear = new Date().getUTCFullYear();
const VenueInput = z.object({
  name: z.string().min(1).max(200),
  nickname: z.string().max(160).optional(),
  summary: z.string().max(600).optional(),
  description: z.string().max(4000).regex(/^[^<>]*$/s, 'HTML is not allowed').optional(),
  websiteUrl: z.string().url('Must be a valid URL').max(500).optional().or(z.literal('')),
  capacity: z.number().int().min(0).max(1_000_000).optional(),
  openedYear: z.number().int().min(1800).max(currentYear + 1).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
});
export type VenueInput = z.input<typeof VenueInput>;
function venueData(v: z.infer<typeof VenueInput>) {
  return {
    name: v.name, nickname: v.nickname?.trim() || null, summary: v.summary?.trim() || null,
    description: v.description?.trim() || null, websiteUrl: v.websiteUrl?.trim() || null,
    capacity: v.capacity ?? null, openedYear: v.openedYear ?? null,
    latitude: v.latitude ?? null, longitude: v.longitude ?? null,
    city: v.city ?? null, state: v.state ?? null, country: v.country ?? null,
  };
}
export async function createVenue(a: Actor, raw: VenueInput): Promise<{ id: string }> {
  req(a); const v = VenueInput.parse(raw); const id = `venue-${slugify(v.name)}`;
  if (await prisma.venue.findUnique({ where: { id } })) throw new ServiceError('conflict', 'A venue with that name exists.');
  await prisma.venue.create({ data: { id, slug: slugify(v.name), ...venueData(v) } });
  await audit(a.id, 'rodeo.venue.create', 'venue', id, v.name); return { id };
}
export async function updateVenue(a: Actor, id: string, raw: VenueInput): Promise<void> {
  req(a); const v = VenueInput.parse(raw);
  if (!(await prisma.venue.findUnique({ where: { id } }))) throw new ServiceError('not_found', 'Venue not found');
  await prisma.venue.update({ where: { id }, data: venueData(v) });
  await audit(a.id, 'rodeo.venue.update', 'venue', id, v.name);
}
export async function deleteVenue(a: Actor, id: string): Promise<void> {
  req(a);
  const [editions, sessions] = await Promise.all([
    prisma.rodeoEventEdition.count({ where: { venueId: id } }),
    // Added by the admin audit: a CompetitionSession carries its OWN optional
    // `venueId`, so a session can name a venue that none of its edition's rows
    // do. That relation is optional with no `onDelete`, so Prisma's default is
    // SetNull — deleting the venue would have silently blanked the location on
    // historical schedule rows instead of refusing.
    prisma.competitionSession.count({ where: { venueId: id } }),
  ]);
  if (editions > 0) throw new ServiceError('conflict', `Cannot delete: ${editions} edition(s) use this venue.`);
  if (sessions > 0) throw new ServiceError('conflict', `Cannot delete: ${sessions} scheduled session(s) take place at this venue.`);
  await prisma.venue.delete({ where: { id } }).catch(() => { throw new ServiceError('not_found', 'Venue not found'); });
  await cleanupLandingRows('VENUE', id);
  await audit(a.id, 'rodeo.venue.delete', 'venue', id);
}

// ---- Disciplines ----
export interface DisciplineRef {
  id: string; slug: string; name: string; articleCount: number;
  /** Archive lifecycle state; null means active. */
  archivedAt: Date | null;
  /**
   * Everything that would block a delete, summed. The admin list uses this to
   * offer Delete only where it can actually succeed, and to say why when it
   * cannot — the same contract the Venues tab already follows with
   * `editionCount`. Without it the UI would show a Delete button that the
   * service always refuses.
   */
  dependencyCount: number;
}
export async function listDisciplinesRef(): Promise<DisciplineRef[]> {
  const rows = await prisma.discipline.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: {
        select: {
          articles: true, competitors: true, events: true,
          compResults: true, compSessions: true, compStandings: true,
        },
      },
    },
  });
  return rows.map((d) => ({
    id: d.id,
    slug: d.slug,
    name: d.name,
    archivedAt: d.archivedAt,
    articleCount: d._count.articles,
    dependencyCount:
      d._count.articles + d._count.competitors + d._count.events +
      d._count.compResults + d._count.compSessions + d._count.compStandings,
  }));
}
/**
 * Discipline editing (Batch 11, completed in Issue 03).
 *
 * WHAT WAS WRONG. This schema used to carry four fields and a comment saying
 * `slug`/`name`/the guide JSON were "intentionally NOT editable here — the
 * evergreen guide content is preserved". Protecting that content was the right
 * instinct and the wrong mechanism: a public discipline page renders thirteen
 * content fields, and eleven of them had **no administrative owner at all**.
 * The Rodeo Coverage modal even told operators to "add the evergreen guide…in
 * Landing SEO", where no such editor existed either. Every word of the guide
 * could only be changed by editing the database directly.
 *
 * HOW THE CONTENT IS STILL PROTECTED — and this is the part that matters.
 * `guide` is merged KEY BY KEY, so a caller that sends `introduction` alone
 * cannot disturb `scoringBreakdown`, and keys this schema does not model at all
 * (`sources`, `relatedArticleSlugs`) are carried through untouched. Nothing is
 * ever replaced wholesale, and no default is ever invented: an absent key means
 * "leave it exactly as it is", not "reset it".
 *
 * THE ASYMMETRY IS DELIBERATE, because the alternative loses data.
 *   - `shortName` / `category` / `tagline`: absent → **null**. This is the
 *     pre-existing contract — the Landing SEO form sends `f.shortName ||
 *     undefined`, so clearing the box is expressed by omitting the key. Moving
 *     these to merge-on-absent would break "clear this field".
 *   - `name` / `image` / `imageCredit` / `guide`: absent → **unchanged**. These
 *     are new, and existing callers do not send them. If absence cleared them,
 *     every save of the four-field Landing SEO form would erase a discipline's
 *     name and hero image. `tests/issue03-discipline-cms.test.ts` pins that.
 *
 * `slug` is NOT here on purpose: `lib/cms/rodeoSlugs.ts#changeSlug` already
 * changes it, and it also writes the redirect from the old path, checks
 * uniqueness and refuses a collision. Duplicating that here would be a second,
 * worse implementation of a solved problem.
 */
const ScoringItemInput = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(1500),
});
const TerminologyItemInput = z.object({
  term: z.string().trim().min(1).max(120),
  definition: z.string().trim().min(1).max(1500),
});

/**
 * The evergreen guide. Every key optional; order within an array IS the public
 * display order, so reordering is expressed by sending the array reordered.
 */
const DisciplineGuideInput = z.object({
  introduction: z.string().max(4000).optional(),
  competitionFormat: z.string().max(4000).optional(),
  stockProfile: z.string().max(4000).optional(),
  historicBenchmark: z.string().max(4000).optional(),
  scoringBreakdown: z.array(ScoringItemInput).max(24).optional(),
  rulesHighlights: z.array(z.string().trim().min(1).max(600)).max(40).optional(),
  terminology: z.array(TerminologyItemInput).max(80).optional(),
  beginnerTips: z.array(z.string().trim().min(1).max(600)).max(40).optional(),
});
export type DisciplineGuideInput = z.input<typeof DisciplineGuideInput>;

/** Guide keys this schema owns. Anything else in the stored JSON is preserved. */
const GUIDE_KEYS = [
  'introduction', 'competitionFormat', 'stockProfile', 'historicBenchmark',
  'scoringBreakdown', 'rulesHighlights', 'terminology', 'beginnerTips',
] as const;

const DisciplineInput = z.object({
  // Pre-existing fields: absent clears (see the note above).
  shortName: z.string().max(80).optional(),
  /**
   * LEGACY classification text. Still accepted so that callers written before
   * Batch 05 (and the fallback selectors used when the managed table is absent)
   * keep working; constrained to the compatibility vocabulary as before.
   */
  category: z.enum(DISCIPLINE_CLASSIFICATIONS).optional(),
  /**
   * Batch 05 — the MANAGED classification, by stable id. Preferred over
   * `category`: it is a real reference, so a later rename follows automatically.
   * `null` clears the classification.
   */
  classificationId: z.string().trim().min(1).max(64).nullable().optional(),
  tagline: z.string().max(240).optional(),
  summary: z.string().min(1).max(2000),
  // Added in Issue 03: absent leaves unchanged.
  name: z.string().trim().min(1).max(120).optional(),
  image: z.string().trim().max(600).optional(),
  imageCredit: z.string().trim().max(200).optional(),
  guide: DisciplineGuideInput.optional(),
});
export type DisciplineInput = z.input<typeof DisciplineInput>;

export async function updateDiscipline(a: Actor, id: string, raw: DisciplineInput): Promise<void> {
  req(a); const v = DisciplineInput.parse(raw);
  const existing = await prisma.discipline.findUnique({ where: { id }, select: { id: true, guide: true } });
  if (!existing) throw new ServiceError('not_found', 'Discipline not found');

  const data: Prisma.DisciplineUpdateInput = {
    shortName: v.shortName ?? null,
    category: v.category ?? null,
    tagline: v.tagline ?? null,
    summary: v.summary,
  };

  /**
   * A managed reference, when the caller sent one, overrides the legacy text —
   * including the `category: v.category ?? null` above, which exists so that an
   * absent field clears the value (the convention this form has always used).
   */
  const managed = await resolveClassification(v);
  if (managed) {
    data.category = managed.category;
    data.classification = managed.classificationId
      ? { connect: { id: managed.classificationId } }
      : { disconnect: true };
  }
  if (v.name !== undefined) data.name = v.name;
  if (v.image !== undefined) data.image = v.image === '' ? null : v.image;
  if (v.imageCredit !== undefined) data.imageCredit = v.imageCredit === '' ? null : v.imageCredit;

  if (v.guide !== undefined) {
    // Merge onto whatever is stored, so unmodelled keys and untouched sections
    // survive. An empty array is a real value (the editor removed every entry);
    // `undefined` is not.
    const current = (existing.guide && typeof existing.guide === 'object' && !Array.isArray(existing.guide)
      ? (existing.guide as Record<string, unknown>)
      : {});
    const merged: Record<string, unknown> = { ...current };
    for (const k of GUIDE_KEYS) {
      const next = (v.guide as Record<string, unknown>)[k];
      if (next !== undefined) merged[k] = next;
    }
    data.guide = merged as Prisma.InputJsonValue;
  }

  await prisma.discipline.update({ where: { id }, data });
  await audit(a.id, 'rodeo.discipline.update', 'discipline', id, v.guide ? 'core+guide' : 'core');
}
/**
 * Creating and deleting disciplines (Rodeo Coverage admin audit).
 *
 * The Disciplines tab was read-only and carried the note that the seven
 * disciplines are "managed in the schema/seed, not deleted here". The owner asked
 * for Add and Delete, and the schema supports both without any migration:
 * `Discipline` needs only `slug`, `name` and `summary`.
 *
 * ONE CAVEAT THE OPERATOR MUST KNOW, and it is recorded in the audit detail
 * rather than hidden: `prisma/seed.ts` upserts the seven foundational disciplines
 * by the fixed id `disc-<slug>`. The upsert passes `update: {}`, so it never
 * overwrites an edit — but it DOES recreate a foundational discipline that has
 * been deleted, the next time the seed runs. A discipline created here uses the
 * same `disc-<slug>` id convention and is not in the seed list, so it is not
 * recreated. Making deletion durable against a re-seed would mean changing seed
 * ownership, which is out of scope for this audit.
 */
const DisciplineCreateInput = z.object({
  name: z.string().min(1).max(120),
  summary: z.string().min(1).max(2000),
  shortName: z.string().max(80).optional(),
  // Same two routes as DisciplineInput above: legacy text, or managed id.
  category: z.enum(DISCIPLINE_CLASSIFICATIONS).optional(),
  classificationId: z.string().trim().min(1).max(64).nullable().optional(),
  tagline: z.string().max(240).optional(),
});

/**
 * Resolves a managed classification reference into the two columns that record
 * it, or returns `undefined` when the caller did not mention one.
 *
 * BOTH COLUMNS ARE WRITTEN. `classificationId` is the truth; `category` is kept
 * as a mirror of the classification's immutable `value`, because the legacy
 * column is what the full-text `searchVector` indexes and what the application
 * falls back to when the managed table is unreachable. Letting them drift would
 * make the fallback lie.
 *
 * An unknown id is a validation error rather than a silently dropped field: a
 * form offering a classification that has since been deleted must say so, not
 * save the discipline unclassified.
 */
async function resolveClassification(
  v: { classificationId?: string | null },
): Promise<{ classificationId: string | null; category: string | null } | undefined> {
  if (v.classificationId === undefined) return undefined;
  if (v.classificationId === null) return { classificationId: null, category: null };
  let row: { id: string; value: string } | null = null;
  try {
    row = await prisma.disciplineClassification.findUnique({
      where: { id: v.classificationId },
      select: { id: true, value: true },
    });
  } catch {
    // The managed table is absent or unreachable (e.g. the migration has not
    // been applied on this environment). Refuse rather than write a dangling id.
    throw new ServiceError('validation', 'Managed classifications are not available on this environment.');
  }
  if (!row) throw new ServiceError('validation', 'That classification no longer exists. Reload and choose another.');
  return { classificationId: row.id, category: row.value };
}
export type DisciplineCreateInput = z.input<typeof DisciplineCreateInput>;

export async function createDiscipline(a: Actor, raw: DisciplineCreateInput): Promise<{ id: string }> {
  req(a);
  const v = DisciplineCreateInput.parse(raw);
  const slug = slugify(v.name);
  if (!slug) throw new ServiceError('validation', 'That name does not produce a usable URL slug.');
  const id = `disc-${slug}`;
  // Slug and id are both derived, so either collision means the same thing.
  const existing = await prisma.discipline.findFirst({ where: { OR: [{ id }, { slug }] }, select: { id: true } });
  if (existing) throw new ServiceError('conflict', `A discipline with the URL slug "${slug}" already exists.`);
  const max = await prisma.discipline.aggregate({ _max: { sortOrder: true } });
  const managed = await resolveClassification(v);
  await prisma.discipline.create({
    data: {
      id, slug, name: v.name,
      shortName: v.shortName ?? null,
      category: managed ? managed.category : (v.category ?? null),
      ...(managed?.classificationId ? { classificationId: managed.classificationId } : {}),
      tagline: v.tagline ?? null,
      summary: v.summary,
      // `guide` is left null on purpose: evergreen guide content is written by an
      // editor, never invented at creation time.
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  await audit(a.id, 'rodeo.discipline.create', 'discipline', id, v.name);
  return { id };
}

/** Dependency counts that block deleting a discipline. */
export interface DisciplineDependencies {
  articles: number; competitors: number; events: number;
  results: number; sessions: number; standings: number; total: number;
}
export async function getDisciplineDependencies(id: string): Promise<DisciplineDependencies> {
  const [articles, competitors, events, results, sessions, standings] = await Promise.all([
    prisma.articleDiscipline.count({ where: { disciplineId: id } }),
    prisma.competitorDiscipline.count({ where: { disciplineId: id } }),
    prisma.eventDiscipline.count({ where: { disciplineId: id } }),
    prisma.competitionResult.count({ where: { disciplineId: id } }),
    prisma.competitionSession.count({ where: { disciplineId: id } }),
    prisma.competitionStanding.count({ where: { disciplineId: id } }),
  ]);
  return { articles, competitors, events, results, sessions, standings, total: articles + competitors + events + results + sessions + standings };
}

export async function deleteDiscipline(a: Actor, id: string): Promise<void> {
  req(a);
  /**
   * Every one of these relations would otherwise lose data quietly. The join
   * tables (`ArticleDiscipline`, `CompetitorDiscipline`, `EventDiscipline`) are
   * `onDelete: Cascade`, so article/competitor/event associations would vanish;
   * `CompetitionSession.disciplineId` and `CompetitionStanding.disciplineId` are
   * optional and would be SET NULL, detaching historical records from the
   * discipline they belong to. Only `CompetitionResult.disciplineId` is required,
   * and the database itself would refuse that one — a raw foreign-key error the
   * operator cannot act on. Checking first turns all of it into one clear message.
   */
  if (!(await prisma.discipline.findUnique({ where: { id }, select: { id: true } }))) {
    throw new ServiceError('not_found', 'Discipline not found');
  }
  const dep = await getDisciplineDependencies(id);
  if (dep.total > 0) {
    const parts: string[] = [];
    if (dep.articles) parts.push(`${dep.articles} article(s)`);
    if (dep.competitors) parts.push(`${dep.competitors} competitor profile(s)`);
    if (dep.events) parts.push(`${dep.events} event association(s)`);
    if (dep.results) parts.push(`${dep.results} recorded result(s)`);
    if (dep.sessions) parts.push(`${dep.sessions} scheduled session(s)`);
    if (dep.standings) parts.push(`${dep.standings} standing(s)`);
    throw new ServiceError(
      'conflict',
      `Cannot delete: this discipline is still referenced by ${parts.join(', ')}. ` +
        'Reassign or remove those records first.',
    );
  }
  /**
   * The delete and its tombstone are ONE transaction.
   *
   * If the tombstone were written afterwards, a crash between the two would
   * leave a discipline deleted with no record of intent — and the next seed run
   * would quietly resurrect it, which is the exact failure this mechanism
   * exists to prevent. Conversely a failed delete must leave no tombstone, or a
   * record that still exists would be excluded from future seeding.
   */
  await prisma.$transaction(async (tx) => {
    await tx.discipline.delete({ where: { id } });
    await tx.seedTombstone.upsert({
      where: { kind_key: { kind: 'discipline', key: id } },
      update: {},
      create: { kind: 'discipline', key: id },
    });
  });
  await cleanupLandingRows('DISCIPLINE', id);
  await audit(
    a.id, 'rodeo.discipline.delete', 'discipline', id,
    'deleted via Rodeo Coverage; tombstoned so no seed run can recreate it',
  );
}

/* ───────────────────────── Archive lifecycle ─────────────────────────
 *
 * Archive and Reactivate for all five Rodeo Coverage families (owner-approved
 * `archivedAt` migration).
 *
 * One generic pair rather than ten near-identical functions: the entity kind is
 * a closed union mapped to its Prisma delegate, so a new family cannot be added
 * without also declaring its audit name and admin label. Each operation is
 * idempotent, preserves every relationship, writes no other column, and is
 * audited.
 *
 * Archive deliberately does NOT touch publication state, and does NOT write to
 * child rows — see `lib/cms/lifecycle.ts` for the effective-visibility rule that
 * makes an archived parent hide its children without modifying them.
 */
export type RodeoEntityKind = 'hub' | 'event' | 'edition' | 'venue' | 'discipline';

const ENTITY_META: Record<RodeoEntityKind, { label: string; auditEntity: string }> = {
  hub: { label: 'Hub', auditEntity: 'rodeo_hub' },
  event: { label: 'Recurring event', auditEntity: 'rodeo_event' },
  edition: { label: 'Edition', auditEntity: 'event_edition' },
  venue: { label: 'Venue', auditEntity: 'venue' },
  discipline: { label: 'Discipline', auditEntity: 'discipline' },
};

/**
 * Read and write `archivedAt` per family with Prisma's own types.
 *
 * A structural cast over the five delegates does not typecheck — their generic
 * signatures do not unify — and forcing it through `as unknown` would disable
 * checking in precisely the code that must not leak an archived record. An
 * explicit switch costs a few lines and keeps every call fully typed.
 */
async function readArchivedAt(kind: RodeoEntityKind, id: string): Promise<{ archivedAt: Date | null } | null> {
  const sel = { where: { id }, select: { archivedAt: true } } as const;
  switch (kind) {
    case 'hub': return prisma.rodeoHub.findUnique(sel);
    case 'event': return prisma.rodeoEvent.findUnique(sel);
    case 'edition': return prisma.rodeoEventEdition.findUnique(sel);
    case 'venue': return prisma.venue.findUnique(sel);
    case 'discipline': return prisma.discipline.findUnique(sel);
  }
}

async function writeArchivedAt(kind: RodeoEntityKind, id: string, archivedAt: Date | null): Promise<void> {
  const args = { where: { id }, data: { archivedAt } } as const;
  switch (kind) {
    case 'hub': await prisma.rodeoHub.update(args); return;
    case 'event': await prisma.rodeoEvent.update(args); return;
    case 'edition': await prisma.rodeoEventEdition.update(args); return;
    case 'venue': await prisma.venue.update(args); return;
    case 'discipline': await prisma.discipline.update(args); return;
  }
}

async function setArchivedAt(a: Actor, kind: RodeoEntityKind, id: string, value: Date | null): Promise<void> {
  req(a);
  const meta = ENTITY_META[kind];
  const row = await readArchivedAt(kind, id);
  if (!row) throw new ServiceError('not_found', `${meta.label} not found`);

  // Idempotent: re-archiving must not move the timestamp, which would misreport
  // when the record actually left public view.
  const already = value === null ? row.archivedAt === null : row.archivedAt !== null;
  if (already) return;

  await writeArchivedAt(kind, id, value);
  await audit(
    a.id,
    value === null ? `rodeo.${kind}.reactivate` : `rodeo.${kind}.archive`,
    meta.auditEntity,
    id,
    value === null
      ? 'returned to active listings; publication state unchanged'
      : 'removed from active listings and the sitemap; detail URL stays reachable as noindex',
  );
}

export async function archiveEntity(a: Actor, kind: RodeoEntityKind, id: string): Promise<void> {
  return setArchivedAt(a, kind, id, new Date());
}

export async function reactivateEntity(a: Actor, kind: RodeoEntityKind, id: string): Promise<void> {
  return setArchivedAt(a, kind, id, null);
}

export async function listEventsForSelect(): Promise<{ id: string; name: string }[]> {
  return prisma.rodeoEvent.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
}
export async function listVenuesForSelect(): Promise<{ id: string; name: string }[]> {
  return prisma.venue.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
}
