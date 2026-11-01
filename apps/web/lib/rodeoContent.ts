import 'server-only';
import { prisma } from './db';

/**
 * NFRGuide — Server-only public read layer for rodeo entities (Batch 10).
 *
 * Exposes hubs, recurring events and annual editions for the public pages under
 * `/rodeo-events/`. Only PUBLISHED articles are ever linked; rodeo entities carry no
 * draft workflow, so "public = exists". The recurring-event vs. annual-edition
 * distinction is preserved and an event's URL is hub-independent (Master Reqs).
 *
 * `indexable` is true only when an entity has real content, so thin/empty records are
 * noindex'd rather than creating weak indexable URLs.
 */

const PUBLISHED = 'PUBLISHED' as const;

export interface PublicArticleRef {
  slug: string;
  title: string;
  deck: string | null;
  category: string;
  publishedAt: string | null;
}
export interface PublicVenue { name: string; city: string | null; state: string | null; country: string | null }

export interface PublicEditionCard {
  editionSlug: string;
  label: string;
  year: number | null;
  startAt: string | null;
  endAt: string | null;
  datesKnown: boolean;
  venue: PublicVenue | null;
}

export interface PublicEventCard {
  slug: string;
  name: string;
  location: string | null;
  traditionalMonth: string | null;
  isFlagship: boolean;
}

export interface PublicHub {
  id: string;
  slug: string;
  title: string;
  region: string | null;
  circuitType: string | null;
  description: string | null;
  events: PublicEventCard[];
  articles: PublicArticleRef[];
  indexable: boolean;
}

export interface PublicEvent {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  traditionalMonth: string | null;
  status: string | null;
  description: string | null;
  organizerName: string | null;
  officialUrl: string | null;
  isFlagship: boolean;
  editions: PublicEditionCard[];
  hubs: { slug: string; title: string }[];
  articles: PublicArticleRef[];
  indexable: boolean;
}

export interface PublicEdition {
  id: string;
  editionSlug: string;
  label: string;
  year: number | null;
  startAt: string | null;
  endAt: string | null;
  datesKnown: boolean;
  timezone: string | null;
  purseBenchmark: string | null;
  venue: PublicVenue | null;
  event: { slug: string; name: string; location: string | null };
  articles: PublicArticleRef[];
  indexable: boolean;
}

const articleRef = {
  select: { slug: true, title: true, deck: true, publishedAt: true, category: { select: { name: true } } },
} as const;
function mapArticle(a: { slug: string; title: string; deck: string | null; publishedAt: Date | null; category: { name: string } }): PublicArticleRef {
  return { slug: a.slug, title: a.title, deck: a.deck, category: a.category.name, publishedAt: a.publishedAt?.toISOString() ?? null };
}
function mapVenue(v: { name: string; city: string | null; state: string | null; country: string | null } | null): PublicVenue | null {
  return v ? { name: v.name, city: v.city, state: v.state, country: v.country } : null;
}
function mapEditionCard(e: { editionSlug: string; label: string; year: number | null; startAt: Date | null; endAt: Date | null; venue: { name: string; city: string | null; state: string | null; country: string | null } | null }): PublicEditionCard {
  return { editionSlug: e.editionSlug, label: e.label, year: e.year, startAt: e.startAt?.toISOString() ?? null, endAt: e.endAt?.toISOString() ?? null, datesKnown: !!(e.startAt && e.endAt), venue: mapVenue(e.venue) };
}

// ---- Hubs ----
export async function getPublicHubBySlug(slug: string): Promise<PublicHub | null> {
  const hub = await prisma.rodeoHub.findUnique({
    where: { slug },
    include: {
      hubEvents: { orderBy: { sortOrder: 'asc' }, include: { event: { select: { slug: true, name: true, location: true, traditionalMonth: true, isFlagship: true } } } },
      articles: { where: { article: { workflowStatus: PUBLISHED } }, include: { article: articleRef } },
    },
  });
  if (!hub) return null;
  const events = hub.hubEvents.map((he) => ({ slug: he.event.slug, name: he.event.name, location: he.event.location, traditionalMonth: he.event.traditionalMonth, isFlagship: he.event.isFlagship }));
  const articles = hub.articles.map((a) => mapArticle(a.article)).sort((x, y) => (y.publishedAt ?? '').localeCompare(x.publishedAt ?? ''));
  return {
    id: hub.id, slug: hub.slug, title: hub.title, region: hub.region, circuitType: hub.circuitType, description: hub.description,
    events, articles, indexable: events.length > 0 || articles.length > 0,
  };
}

export async function listPublicHubs(): Promise<{ slug: string; title: string; region: string | null; description: string | null; eventCount: number }[]> {
  const hubs = await prisma.rodeoHub.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { hubEvents: true } } } });
  return hubs.map((h) => ({ slug: h.slug, title: h.title, region: h.region, description: h.description, eventCount: h._count.hubEvents }));
}

// ---- Events ----
export async function getPublicEventBySlug(slug: string): Promise<PublicEvent | null> {
  const ev = await prisma.rodeoEvent.findUnique({
    where: { slug },
    include: {
      editions: { orderBy: [{ year: 'desc' }, { startAt: 'desc' }], include: { venue: true } },
      hubLinks: { include: { hub: { select: { slug: true, title: true } } } },
      articles: { where: { article: { workflowStatus: PUBLISHED } }, include: { article: articleRef } },
    },
  });
  if (!ev) return null;
  const editions = ev.editions.map(mapEditionCard);
  const articles = ev.articles.map((a) => mapArticle(a.article)).sort((x, y) => (y.publishedAt ?? '').localeCompare(x.publishedAt ?? ''));
  return {
    id: ev.id, slug: ev.slug, name: ev.name, location: ev.location, traditionalMonth: ev.traditionalMonth, status: ev.status,
    description: ev.description, organizerName: ev.organizerName, officialUrl: ev.officialUrl, isFlagship: ev.isFlagship,
    editions, hubs: ev.hubLinks.map((h) => ({ slug: h.hub.slug, title: h.hub.title })), articles,
    indexable: editions.length > 0 || articles.length > 0 || !!ev.description,
  };
}

export async function listPublicEvents(): Promise<PublicEventCard[]> {
  const evs = await prisma.rodeoEvent.findMany({ orderBy: [{ isFlagship: 'desc' }, { name: 'asc' }], select: { slug: true, name: true, location: true, traditionalMonth: true, isFlagship: true } });
  return evs.map((e) => ({ slug: e.slug, name: e.name, location: e.location, traditionalMonth: e.traditionalMonth, isFlagship: e.isFlagship }));
}

// ---- Editions ----
export async function getPublicEditionBySlug(eventSlug: string, editionSlug: string): Promise<PublicEdition | null> {
  const ev = await prisma.rodeoEvent.findUnique({ where: { slug: eventSlug }, select: { id: true, slug: true, name: true, location: true } });
  if (!ev) return null;
  const ed = await prisma.rodeoEventEdition.findFirst({
    where: { eventId: ev.id, editionSlug }, // enforces edition belongs to this event
    include: { venue: true, articles: { where: { article: { workflowStatus: PUBLISHED } }, include: { article: articleRef } } },
  });
  if (!ed) return null;
  const articles = ed.articles.map((a) => mapArticle(a.article)).sort((x, y) => (y.publishedAt ?? '').localeCompare(x.publishedAt ?? ''));
  return {
    id: ed.id, editionSlug: ed.editionSlug, label: ed.label, year: ed.year,
    startAt: ed.startAt?.toISOString() ?? null, endAt: ed.endAt?.toISOString() ?? null, datesKnown: !!(ed.startAt && ed.endAt),
    timezone: ed.timezone, purseBenchmark: ed.purseBenchmark, venue: mapVenue(ed.venue),
    event: { slug: ev.slug, name: ev.name, location: ev.location }, articles, indexable: true,
  };
}

// ---- Resolver (hub-or-event at /rodeo-events/<slug>/) ----
export type RodeoResolution = { kind: 'event'; slug: string } | { kind: 'hub'; slug: string } | null;

/** Event precedence, then hub (cross-table slug uniqueness is enforced on write, so a
 * collision should never occur; precedence is the deterministic safety net). */
export async function resolveRodeoEntity(slug: string): Promise<RodeoResolution> {
  const ev = await prisma.rodeoEvent.findUnique({ where: { slug }, select: { slug: true } });
  if (ev) return { kind: 'event', slug: ev.slug };
  const hub = await prisma.rodeoHub.findUnique({ where: { slug }, select: { slug: true } });
  if (hub) return { kind: 'hub', slug: hub.slug };
  return null;
}

// ---- Params for SSG + sitemap ----
export async function getAllRodeoSlugs(): Promise<{ hubs: string[]; events: string[]; editions: { eventSlug: string; editionSlug: string }[] }> {
  const [hubs, events, editions] = await Promise.all([
    prisma.rodeoHub.findMany({ select: { slug: true } }),
    prisma.rodeoEvent.findMany({ select: { slug: true } }),
    prisma.rodeoEventEdition.findMany({ select: { editionSlug: true, event: { select: { slug: true } } } }),
  ]);
  return {
    hubs: hubs.map((h) => h.slug),
    events: events.map((e) => e.slug),
    editions: editions.map((e) => ({ eventSlug: e.event.slug, editionSlug: e.editionSlug })),
  };
}
