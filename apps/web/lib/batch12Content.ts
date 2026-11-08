import 'server-only';
import { prisma } from './db';

/**
 * NFRGuide — Server-only public read layer for venues & competitors (Batch 12).
 *
 * Only PUBLISHED articles are ever surfaced. These entities carry no draft workflow,
 * so "public = exists", but `indexable` is true only when a record has real content —
 * thin/empty records are noindex'd rather than creating weak indexable URLs (this is
 * combined with the editor SEO `noindex`, which can only add restriction).
 */

const PUBLISHED = 'PUBLISHED' as const;

export interface PublicArticleRef { slug: string; title: string; deck: string | null; category: string; publishedAt: string | null }
const articleRef = { select: { slug: true, title: true, deck: true, publishedAt: true, category: { select: { name: true } } } } as const;
function mapArticle(a: { slug: string; title: string; deck: string | null; publishedAt: Date | null; category: { name: string } }): PublicArticleRef {
  return { slug: a.slug, title: a.title, deck: a.deck, category: a.category.name, publishedAt: a.publishedAt?.toISOString() ?? null };
}
function sortByPublished(list: PublicArticleRef[]): PublicArticleRef[] {
  return [...list].sort((x, y) => (y.publishedAt ?? '').localeCompare(x.publishedAt ?? ''));
}

// ---- Venues ----
export interface PublicVenueEdition { eventSlug: string; eventName: string; editionSlug: string; label: string; year: number | null }
export interface PublicVenue {
  id: string; slug: string; name: string; nickname: string | null; summary: string | null; description: string | null;
  websiteUrl: string | null; capacity: number | null; openedYear: number | null;
  latitude: number | null; longitude: number | null; city: string | null; state: string | null; country: string | null;
  editions: PublicVenueEdition[]; articles: PublicArticleRef[]; indexable: boolean;
}

export async function getPublicVenueBySlug(slug: string): Promise<PublicVenue | null> {
  const v = await prisma.venue.findUnique({
    where: { slug },
    include: {
      editions: {
        orderBy: [{ year: 'desc' }],
        include: {
          event: { select: { slug: true, name: true } },
          articles: { where: { article: { workflowStatus: PUBLISHED } }, include: { article: articleRef } },
        },
      },
    },
  });
  if (!v) return null;
  const editions: PublicVenueEdition[] = v.editions.map((e) => ({ eventSlug: e.event.slug, eventName: e.event.name, editionSlug: e.editionSlug, label: e.label, year: e.year }));
  const seen = new Set<string>();
  const articles: PublicArticleRef[] = [];
  for (const e of v.editions) for (const link of e.articles) { if (!seen.has(link.article.slug)) { seen.add(link.article.slug); articles.push(mapArticle(link.article)); } }
  return {
    id: v.id, slug: v.slug, name: v.name, nickname: v.nickname, summary: v.summary, description: v.description,
    websiteUrl: v.websiteUrl, capacity: v.capacity, openedYear: v.openedYear, latitude: v.latitude, longitude: v.longitude,
    city: v.city, state: v.state, country: v.country,
    editions, articles: sortByPublished(articles),
    indexable: !!(v.summary || v.description) || editions.length > 0 || articles.length > 0,
  };
}

export async function getAllVenueSlugs(): Promise<string[]> {
  const rows = await prisma.venue.findMany({ select: { slug: true } });
  return rows.map((r) => r.slug);
}

/** Venues meeting the existing content-eligibility rule (have real content). Batch S4:
 *  the sitemap applies EntitySeo noindex/canonical via lib/seo/policy.ts on these rows. */
export async function getContentEligibleVenues(): Promise<{ id: string; slug: string }[]> {
  return prisma.venue.findMany({ where: { OR: [{ summary: { not: null } }, { description: { not: null } }, { editions: { some: {} } }] }, select: { id: true, slug: true } });
}

/** Slugs of venues eligible for the sitemap (have real content). Editor `noindex` is
 *  also honored by excluding any venue with an EntitySeo noindex override. */
export async function getIndexableVenueSlugs(): Promise<string[]> {
  const [rows, noindex] = await Promise.all([
    getContentEligibleVenues(),
    prisma.entitySeo.findMany({ where: { entityType: 'VENUE', noindex: true }, select: { entityId: true } }),
  ]);
  const blocked = new Set(noindex.map((n) => n.entityId));
  return rows.filter((r) => !blocked.has(r.id)).map((r) => r.slug);
}

// ---- Competitors ----
export interface PublicParticipation { eventSlug: string; eventName: string; editionSlug: string; editionLabel: string; year: number | null; result: string | null; placement: number | null; note: string | null }
export interface PublicCompetitor {
  id: string; slug: string; fullName: string; knownAs: string | null; summary: string | null;
  hometownCity: string | null; state: string | null; country: string | null; birthYear: number | null; status: string | null;
  heroImage: string | null; imageCredit: string | null;
  disciplines: { slug: string; name: string }[];
  participations: PublicParticipation[];
  articles: PublicArticleRef[]; indexable: boolean;
}

export async function getPublicCompetitorBySlug(slug: string): Promise<PublicCompetitor | null> {
  const c = await prisma.competitor.findUnique({
    where: { slug },
    include: {
      disciplines: { include: { discipline: { select: { slug: true, name: true } } } },
      editions: { include: { edition: { select: { editionSlug: true, label: true, year: true, event: { select: { slug: true, name: true } } } } } },
      articles: { where: { article: { workflowStatus: PUBLISHED } }, include: { article: articleRef } },
    },
  });
  if (!c) return null;
  const disciplines = c.disciplines.map((d) => ({ slug: d.discipline.slug, name: d.discipline.name }));
  const participations: PublicParticipation[] = c.editions
    .map((p) => ({ eventSlug: p.edition.event.slug, eventName: p.edition.event.name, editionSlug: p.edition.editionSlug, editionLabel: p.edition.label, year: p.edition.year, result: p.result, placement: p.placement, note: p.note }))
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const articles = sortByPublished(c.articles.map((a) => mapArticle(a.article)));
  return {
    id: c.id, slug: c.slug, fullName: c.fullName, knownAs: c.knownAs, summary: c.summary,
    hometownCity: c.hometownCity, state: c.state, country: c.country, birthYear: c.birthYear, status: c.status,
    heroImage: c.heroImage, imageCredit: c.imageCredit,
    disciplines, participations, articles,
    indexable: !!c.summary || disciplines.length > 0 || participations.length > 0 || articles.length > 0,
  };
}

export async function getAllCompetitorSlugs(): Promise<string[]> {
  const rows = await prisma.competitor.findMany({ select: { slug: true } });
  return rows.map((r) => r.slug);
}

/** Competitors meeting the existing content-eligibility rule (Batch S4 sitemap candidates). */
export async function getContentEligibleCompetitors(): Promise<{ id: string; slug: string }[]> {
  return prisma.competitor.findMany({ where: { OR: [{ summary: { not: null } }, { disciplines: { some: {} } }, { editions: { some: {} } }, { articles: { some: { article: { workflowStatus: PUBLISHED } } } }] }, select: { id: true, slug: true } });
}

/** Slugs of competitors eligible for the sitemap (have real content), honoring editor noindex. */
export async function getIndexableCompetitorSlugs(): Promise<string[]> {
  const [rows, noindex] = await Promise.all([
    getContentEligibleCompetitors(),
    prisma.entitySeo.findMany({ where: { entityType: 'COMPETITOR', noindex: true }, select: { entityId: true } }),
  ]);
  const blocked = new Set(noindex.map((n) => n.entityId));
  return rows.filter((r) => !blocked.has(r.id)).map((r) => r.slug);
}

/** Hometown as a single display/structured-data string, or null. */
export function competitorHometown(c: Pick<PublicCompetitor, 'hometownCity' | 'state' | 'country'>): string | null {
  const parts = [c.hometownCity, c.state, c.country].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

// ---- Public directories (Batch 15) ----
const PAGE_SIZE = 24;
function clampPage(p: unknown): number { const n = Math.floor(Number(p) || 1); return n < 1 ? 1 : n > 10000 ? 10000 : n; }
function cleanQuery(q: unknown): string { return typeof q === 'string' ? q.trim().slice(0, 80) : ''; }

export interface CompetitorCard { slug: string; fullName: string; knownAs: string | null; hometown: string | null; status: string | null; disciplines: string[]; heroImage: string | null }
export interface DirectoryResult<T> { items: T[]; total: number; page: number; pageSize: number; totalPages: number }

export async function listPublicCompetitors(opts: { q?: string; disciplineSlug?: string; page?: number }): Promise<DirectoryResult<CompetitorCard> & { disciplineOptions: { slug: string; name: string }[] }> {
  const q = cleanQuery(opts.q); const page = clampPage(opts.page); const disciplineSlug = cleanQuery(opts.disciplineSlug) || undefined;
  const where = {
    ...(q ? { fullName: { contains: q, mode: 'insensitive' as const } } : {}),
    ...(disciplineSlug ? { disciplines: { some: { discipline: { slug: disciplineSlug } } } } : {}),
  };
  const [total, rows, disciplineOptions] = await Promise.all([
    prisma.competitor.count({ where }),
    prisma.competitor.findMany({
      where, orderBy: [{ sortOrder: 'asc' }, { fullName: 'asc' }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { slug: true, fullName: true, knownAs: true, hometownCity: true, state: true, country: true, status: true, heroImage: true, disciplines: { select: { discipline: { select: { name: true } } } } },
    }),
    prisma.discipline.findMany({ orderBy: { sortOrder: 'asc' }, select: { slug: true, name: true } }),
  ]);
  const items: CompetitorCard[] = rows.map((c) => ({ slug: c.slug, fullName: c.fullName, knownAs: c.knownAs, hometown: competitorHometown(c), status: c.status, disciplines: c.disciplines.map((d) => d.discipline.name), heroImage: c.heroImage }));
  return { items, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), disciplineOptions };
}

export interface VenueCard { slug: string; name: string; nickname: string | null; location: string | null; capacity: number | null; editionCount: number }
export async function listPublicVenues(opts: { q?: string; country?: string; page?: number }): Promise<DirectoryResult<VenueCard> & { countryOptions: string[] }> {
  const q = cleanQuery(opts.q); const page = clampPage(opts.page); const country = cleanQuery(opts.country) || undefined;
  const where = {
    ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    ...(country ? { country: { equals: country, mode: 'insensitive' as const } } : {}),
  };
  const [total, rows, countryRows] = await Promise.all([
    prisma.venue.count({ where }),
    prisma.venue.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
      select: { slug: true, name: true, nickname: true, city: true, state: true, country: true, capacity: true, _count: { select: { editions: true } } } }),
    prisma.venue.findMany({ where: { country: { not: null } }, distinct: ['country'], select: { country: true }, orderBy: { country: 'asc' } }),
  ]);
  const items: VenueCard[] = rows.map((v) => ({ slug: v.slug, name: v.name, nickname: v.nickname, location: [v.city, v.state, v.country].filter(Boolean).join(', ') || null, capacity: v.capacity, editionCount: v._count.editions }));
  return { items, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), countryOptions: countryRows.map((c) => c.country!).filter(Boolean) };
}
