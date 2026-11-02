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

/** Slugs of venues eligible for the sitemap (have real content). Editor `noindex` is
 *  also honored by excluding any venue with an EntitySeo noindex override. */
export async function getIndexableVenueSlugs(): Promise<string[]> {
  const [rows, noindex] = await Promise.all([
    prisma.venue.findMany({ where: { OR: [{ summary: { not: null } }, { description: { not: null } }, { editions: { some: {} } }] }, select: { id: true, slug: true } }),
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

/** Slugs of competitors eligible for the sitemap (have real content), honoring editor noindex. */
export async function getIndexableCompetitorSlugs(): Promise<string[]> {
  const [rows, noindex] = await Promise.all([
    prisma.competitor.findMany({ where: { OR: [{ summary: { not: null } }, { disciplines: { some: {} } }, { editions: { some: {} } }, { articles: { some: { article: { workflowStatus: PUBLISHED } } } }] }, select: { id: true, slug: true } }),
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
