import 'server-only';
import { z } from 'zod';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';

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
export interface HubRow { id: string; slug: string; title: string; region: string | null; circuitType: string | null; articleCount: number; }
export async function listHubs(): Promise<HubRow[]> {
  const rows = await prisma.rodeoHub.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { articles: true } } } });
  return rows.map((h) => ({ id: h.id, slug: h.slug, title: h.title, region: h.region, circuitType: h.circuitType, articleCount: h._count.articles }));
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
  await audit(a.id, 'rodeo.hub.delete', 'rodeo_hub', id);
}

// ---- Recurring Events ----
export interface EventRow { id: string; slug: string; name: string; location: string | null; status: string | null; isFlagship: boolean; editionCount: number; articleCount: number; }
export async function listEvents(): Promise<EventRow[]> {
  const rows = await prisma.rodeoEvent.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { editions: true, articles: true } } } });
  return rows.map((e) => ({ id: e.id, slug: e.slug, name: e.name, location: e.location, status: e.status, isFlagship: e.isFlagship, editionCount: e._count.editions, articleCount: e._count.articles }));
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
  await audit(a.id, 'rodeo.event.delete', 'rodeo_event', id);
}

// ---- Event Editions (unique per event+editionSlug) ----
export interface EditionRow { id: string; eventId: string; eventName: string; editionSlug: string; label: string; year: number | null; purseBenchmark: string | null; venueName: string | null; articleCount: number; }
export async function listEditions(): Promise<EditionRow[]> {
  const rows = await prisma.rodeoEventEdition.findMany({ orderBy: [{ eventId: 'asc' }, { editionSlug: 'desc' }], include: { event: { select: { name: true } }, venue: { select: { name: true } }, _count: { select: { articles: true } } } });
  return rows.map((ed) => ({ id: ed.id, eventId: ed.eventId, eventName: ed.event.name, editionSlug: ed.editionSlug, label: ed.label, year: ed.year, purseBenchmark: ed.purseBenchmark, venueName: ed.venue?.name ?? null, articleCount: ed._count.articles }));
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
export async function deleteEdition(a: Actor, id: string): Promise<void> {
  req(a); const articles = await prisma.articleEdition.count({ where: { editionId: id } });
  if (articles > 0) throw new ServiceError('conflict', `Cannot delete: ${articles} article(s) reference this edition.`);
  await prisma.rodeoEventEdition.delete({ where: { id } }).catch(() => { throw new ServiceError('not_found', 'Edition not found'); });
  await audit(a.id, 'rodeo.edition.delete', 'event_edition', id);
}

// ---- Venues ----
export interface VenueRow { id: string; slug: string; name: string; city: string | null; state: string | null; editionCount: number; }
export async function listVenues(): Promise<VenueRow[]> {
  const rows = await prisma.venue.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { editions: true } } } });
  return rows.map((v) => ({ id: v.id, slug: v.slug, name: v.name, city: v.city, state: v.state, editionCount: v._count.editions }));
}
const VenueInput = z.object({ name: z.string().min(1).max(200), city: z.string().max(120).optional(), state: z.string().max(120).optional(), country: z.string().max(120).optional() });
export type VenueInput = z.input<typeof VenueInput>;
export async function createVenue(a: Actor, raw: VenueInput): Promise<{ id: string }> {
  req(a); const v = VenueInput.parse(raw); const id = `venue-${slugify(v.name)}`;
  if (await prisma.venue.findUnique({ where: { id } })) throw new ServiceError('conflict', 'A venue with that name exists.');
  await prisma.venue.create({ data: { id, slug: slugify(v.name), name: v.name, city: v.city ?? null, state: v.state ?? null, country: v.country ?? null } });
  await audit(a.id, 'rodeo.venue.create', 'venue', id, v.name); return { id };
}
export async function updateVenue(a: Actor, id: string, raw: VenueInput): Promise<void> {
  req(a); const v = VenueInput.parse(raw);
  if (!(await prisma.venue.findUnique({ where: { id } }))) throw new ServiceError('not_found', 'Venue not found');
  await prisma.venue.update({ where: { id }, data: { name: v.name, city: v.city ?? null, state: v.state ?? null, country: v.country ?? null } });
  await audit(a.id, 'rodeo.venue.update', 'venue', id, v.name);
}
export async function deleteVenue(a: Actor, id: string): Promise<void> {
  req(a); const editions = await prisma.rodeoEventEdition.count({ where: { venueId: id } });
  if (editions > 0) throw new ServiceError('conflict', `Cannot delete: ${editions} edition(s) use this venue.`);
  await prisma.venue.delete({ where: { id } }).catch(() => { throw new ServiceError('not_found', 'Venue not found'); });
  await audit(a.id, 'rodeo.venue.delete', 'venue', id);
}

// ---- Disciplines (read-only foundational) ----
export interface DisciplineRef { id: string; slug: string; name: string; articleCount: number; }
export async function listDisciplinesRef(): Promise<DisciplineRef[]> {
  const rows = await prisma.discipline.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { articles: true } } } });
  return rows.map((d) => ({ id: d.id, slug: d.slug, name: d.name, articleCount: d._count.articles }));
}
export async function listEventsForSelect(): Promise<{ id: string; name: string }[]> {
  return prisma.rodeoEvent.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
}
export async function listVenuesForSelect(): Promise<{ id: string; name: string }[]> {
  return prisma.venue.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
}
