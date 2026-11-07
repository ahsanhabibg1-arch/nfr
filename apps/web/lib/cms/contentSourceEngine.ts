import 'server-only';
import { prisma } from '../db';

/* ── Content Source Types ──────────────────────────────────────────── */

export type SourceMode = 'auto' | 'manual' | 'mixed';

export type SourceEntityType =
  | 'article'
  | 'rodeo-hub'
  | 'rodeo-event'
  | 'rodeo-edition'
  | 'competitor'
  | 'venue';

export interface ContentSourceConfig {
  mode: SourceMode;
  entityType: SourceEntityType;
  manualIds?: string[];
  limit?: number;
  filters?: SourceFilter;
  fallbackPolicy?: 'fill-auto' | 'hide-missing';
  layoutVariant?: string;
  emptyBehavior?: 'collapse' | 'placeholder';
}

export interface SourceFilter {
  categoryId?: string;
  rodeoEventId?: string;
  editionId?: string;
  disciplineId?: string;
  featured?: boolean;
  upcoming?: boolean;
  venueId?: string;
  relatedEntityId?: string;
  relatedEntityType?: SourceEntityType;
}

export interface ResolvedItem {
  id: string;
  title: string;
  slug: string;
  entityType: SourceEntityType;
  imageUrl?: string;
  excerpt?: string;
  publishedAt?: string;
  extra?: Record<string, unknown>;
}

export interface ResolvedSource {
  items: ResolvedItem[];
  sourceConfig: ContentSourceConfig;
  isEmpty: boolean;
}

/* ── Deduplication context ─────────────────────────────────────────── */

export class DeduplicationContext {
  private seen = new Set<string>();

  markSeen(id: string): void { this.seen.add(id); }
  markManySeen(ids: string[]): void { for (const id of ids) this.seen.add(id); }
  hasSeen(id: string): boolean { return this.seen.has(id); }
  filter(items: ResolvedItem[]): ResolvedItem[] {
    return items.filter((i) => {
      if (this.seen.has(i.id)) return false;
      this.seen.add(i.id);
      return true;
    });
  }
}

/* ── Entity resolvers (batched) ────────────────────────────────────── */

async function resolveArticles(
  config: ContentSourceConfig,
  dedup: DeduplicationContext,
): Promise<ResolvedItem[]> {
  const limit = config.limit ?? 10;
  const f = config.filters ?? {};

  const where: Record<string, unknown> = { workflowStatus: 'PUBLISHED' };
  if (f.categoryId) where.categoryId = f.categoryId;
  if (f.featured) where.isFeatured = true;

  if (f.disciplineId) {
    where.disciplines = { some: { disciplineId: f.disciplineId } };
  }
  if (f.rodeoEventId) {
    where.events = { some: { eventId: f.rodeoEventId } };
  }
  if (f.editionId) {
    where.editions = { some: { editionId: f.editionId } };
  }

  if (config.mode === 'manual' && config.manualIds?.length) {
    const articles = await prisma.article.findMany({
      where: { id: { in: config.manualIds }, workflowStatus: 'PUBLISHED' },
      select: { id: true, title: true, slug: true, heroImageUrl: true, excerpt: true, publishedAt: true, articleType: true },
    });
    const map = new Map(articles.map((a) => [a.id, a]));
    const ordered = config.manualIds
      .filter((id) => map.has(id))
      .map((id) => {
        const a = map.get(id)!;
        return toItem(a, 'article');
      });

    if (config.mode === 'manual') {
      if (config.fallbackPolicy === 'fill-auto') {
        const missing = config.manualIds.length - ordered.length;
        if (missing > 0) {
          const excludeIds = new Set([...ordered.map((i) => i.id)]);
          const fill = await fetchAutoArticles(where, missing + 5, excludeIds);
          const filtered = dedup.filter(fill);
          return dedup.filter([...ordered, ...filtered.slice(0, missing)]);
        }
      }
      return dedup.filter(ordered);
    }
  }

  if (config.mode === 'auto') {
    return dedup.filter(await fetchAutoArticles(where, limit, new Set()));
  }

  // mixed: manual first, auto fills remaining
  if (config.mode === 'mixed') {
    const manualItems: ResolvedItem[] = [];
    if (config.manualIds?.length) {
      const articles = await prisma.article.findMany({
        where: { id: { in: config.manualIds }, workflowStatus: 'PUBLISHED' },
        select: { id: true, title: true, slug: true, heroImageUrl: true, excerpt: true, publishedAt: true, articleType: true },
      });
      const map = new Map(articles.map((a) => [a.id, a]));
      for (const id of config.manualIds) {
        if (map.has(id)) manualItems.push(toItem(map.get(id)!, 'article'));
      }
    }
    const remaining = Math.max(0, limit - manualItems.length);
    const excludeIds = new Set(manualItems.map((i) => i.id));
    const auto = remaining > 0 ? await fetchAutoArticles(where, remaining + 5, excludeIds) : [];
    return dedup.filter([...manualItems, ...auto.slice(0, remaining)]);
  }

  return [];
}

async function fetchAutoArticles(
  where: Record<string, unknown>,
  limit: number,
  excludeIds: Set<string>,
): Promise<ResolvedItem[]> {
  const rows = await prisma.article.findMany({
    where: { ...where, ...(excludeIds.size ? { id: { notIn: [...excludeIds] } } : {}) },
    select: { id: true, title: true, slug: true, heroImageUrl: true, excerpt: true, publishedAt: true, articleType: true },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });
  return rows.map((a) => toItem(a, 'article'));
}

function toItem(
  row: { id: string; title: string; slug: string; heroImageUrl?: string | null; excerpt?: string | null; publishedAt?: Date | null; articleType?: string },
  entityType: SourceEntityType,
): ResolvedItem {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    entityType,
    imageUrl: row.heroImageUrl ?? undefined,
    excerpt: row.excerpt?.slice(0, 120) ?? undefined,
    publishedAt: row.publishedAt?.toISOString(),
    extra: row.articleType ? { articleType: row.articleType } : undefined,
  };
}

async function resolveRodeoHubs(
  config: ContentSourceConfig,
  dedup: DeduplicationContext,
): Promise<ResolvedItem[]> {
  const limit = config.limit ?? 10;

  if (config.mode === 'manual' && config.manualIds?.length) {
    const hubs = await prisma.rodeoHub.findMany({
      where: { id: { in: config.manualIds } },
      select: { id: true, title: true, slug: true },
    });
    const map = new Map(hubs.map((h) => [h.id, h]));
    return dedup.filter(
      config.manualIds.filter((id) => map.has(id)).map((id) => {
        const h = map.get(id)!;
        return { id: h.id, title: h.title, slug: h.slug, entityType: 'rodeo-hub' as const };
      }),
    );
  }

  const hubs = await prisma.rodeoHub.findMany({
    select: { id: true, title: true, slug: true },
    orderBy: { title: 'asc' },
    take: limit,
  });
  return dedup.filter(hubs.map((h) => ({ id: h.id, title: h.title, slug: h.slug, entityType: 'rodeo-hub' as const })));
}

async function resolveRodeoEvents(
  config: ContentSourceConfig,
  dedup: DeduplicationContext,
): Promise<ResolvedItem[]> {
  const limit = config.limit ?? 10;

  if (config.mode === 'manual' && config.manualIds?.length) {
    const events = await prisma.rodeoEvent.findMany({
      where: { id: { in: config.manualIds } },
      select: { id: true, name: true, slug: true, status: true },
    });
    const map = new Map(events.map((e) => [e.id, e]));
    return dedup.filter(
      config.manualIds.filter((id) => map.has(id)).map((id) => {
        const e = map.get(id)!;
        return { id: e.id, title: e.name, slug: e.slug, entityType: 'rodeo-event' as const, extra: { status: e.status } };
      }),
    );
  }

  const events = await prisma.rodeoEvent.findMany({
    select: { id: true, name: true, slug: true, status: true },
    orderBy: { name: 'asc' },
    take: limit,
  });
  return dedup.filter(events.map((e) => ({ id: e.id, title: e.name, slug: e.slug, entityType: 'rodeo-event' as const, extra: { status: e.status } })));
}

async function resolveEditions(
  config: ContentSourceConfig,
  dedup: DeduplicationContext,
): Promise<ResolvedItem[]> {
  const limit = config.limit ?? 10;
  const f = config.filters ?? {};

  const where: Record<string, unknown> = {};
  if (f.rodeoEventId) where.eventId = f.rodeoEventId;
  if (f.upcoming) where.startAt = { gte: new Date() };

  if (config.mode === 'manual' && config.manualIds?.length) {
    const editions = await prisma.rodeoEventEdition.findMany({
      where: { id: { in: config.manualIds } },
      select: { id: true, label: true, editionSlug: true, year: true, startAt: true },
    });
    const map = new Map(editions.map((e) => [e.id, e]));
    return dedup.filter(
      config.manualIds.filter((id) => map.has(id)).map((id) => {
        const e = map.get(id)!;
        return { id: e.id, title: e.label, slug: e.editionSlug, entityType: 'rodeo-edition' as const, extra: { year: e.year }, publishedAt: e.startAt?.toISOString() };
      }),
    );
  }

  const editions = await prisma.rodeoEventEdition.findMany({
    where,
    select: { id: true, label: true, editionSlug: true, year: true, startAt: true },
    orderBy: { startAt: 'desc' },
    take: limit,
  });
  return dedup.filter(editions.map((e) => ({
    id: e.id, title: e.label, slug: e.editionSlug, entityType: 'rodeo-edition' as const,
    extra: { year: e.year }, publishedAt: e.startAt?.toISOString(),
  })));
}

async function resolveCompetitors(
  config: ContentSourceConfig,
  dedup: DeduplicationContext,
): Promise<ResolvedItem[]> {
  const limit = config.limit ?? 10;
  const f = config.filters ?? {};

  const where: Record<string, unknown> = {};
  if (f.disciplineId) where.disciplines = { some: { disciplineId: f.disciplineId } };

  if (config.mode === 'manual' && config.manualIds?.length) {
    const comps = await prisma.competitor.findMany({
      where: { id: { in: config.manualIds } },
      select: { id: true, fullName: true, slug: true, heroImage: true, hometownCity: true },
    });
    const map = new Map(comps.map((c) => [c.id, c]));
    return dedup.filter(
      config.manualIds.filter((id) => map.has(id)).map((id) => {
        const c = map.get(id)!;
        return { id: c.id, title: c.fullName, slug: c.slug, entityType: 'competitor' as const, imageUrl: c.heroImage ?? undefined, extra: { hometown: c.hometownCity } };
      }),
    );
  }

  const comps = await prisma.competitor.findMany({
    where,
    select: { id: true, fullName: true, slug: true, heroImage: true, hometownCity: true },
    orderBy: { fullName: 'asc' },
    take: limit,
  });
  return dedup.filter(comps.map((c) => ({
    id: c.id, title: c.fullName, slug: c.slug, entityType: 'competitor' as const,
    imageUrl: c.heroImage ?? undefined, extra: { hometown: c.hometownCity },
  })));
}

async function resolveVenues(
  config: ContentSourceConfig,
  dedup: DeduplicationContext,
): Promise<ResolvedItem[]> {
  const limit = config.limit ?? 10;

  if (config.mode === 'manual' && config.manualIds?.length) {
    const venues = await prisma.venue.findMany({
      where: { id: { in: config.manualIds } },
      select: { id: true, name: true, slug: true, city: true, state: true },
    });
    const map = new Map(venues.map((v) => [v.id, v]));
    return dedup.filter(
      config.manualIds.filter((id) => map.has(id)).map((id) => {
        const v = map.get(id)!;
        return { id: v.id, title: v.name, slug: v.slug, entityType: 'venue' as const, extra: { city: v.city, state: v.state } };
      }),
    );
  }

  const venues = await prisma.venue.findMany({
    select: { id: true, name: true, slug: true, city: true, state: true },
    orderBy: { name: 'asc' },
    take: limit,
  });
  return dedup.filter(venues.map((v) => ({
    id: v.id, title: v.name, slug: v.slug, entityType: 'venue' as const,
    extra: { city: v.city, state: v.state },
  })));
}

/* ── Main resolver ─────────────────────────────────────────────────── */

const RESOLVERS: Record<SourceEntityType, (config: ContentSourceConfig, dedup: DeduplicationContext) => Promise<ResolvedItem[]>> = {
  article: resolveArticles,
  'rodeo-hub': resolveRodeoHubs,
  'rodeo-event': resolveRodeoEvents,
  'rodeo-edition': resolveEditions,
  competitor: resolveCompetitors,
  venue: resolveVenues,
};

export async function resolveContentSource(
  config: ContentSourceConfig,
  dedup?: DeduplicationContext,
): Promise<ResolvedSource> {
  const ctx = dedup ?? new DeduplicationContext();
  const resolver = RESOLVERS[config.entityType];
  if (!resolver) return { items: [], sourceConfig: config, isEmpty: true };
  const items = await resolver(config, ctx);
  return { items, sourceConfig: config, isEmpty: items.length === 0 };
}

export async function resolveMultipleSources(
  configs: { blockId: string; config: ContentSourceConfig }[],
): Promise<Map<string, ResolvedSource>> {
  const dedup = new DeduplicationContext();
  const results = new Map<string, ResolvedSource>();
  for (const { blockId, config } of configs) {
    const result = await resolveContentSource(config, dedup);
    results.set(blockId, result);
  }
  return results;
}

export function parseContentSource(props: Record<string, unknown>): ContentSourceConfig | null {
  const mode = props.sourceMode as string | undefined;
  if (!mode || !['auto', 'manual', 'mixed'].includes(mode)) return null;

  const entityType = (props.sourceEntityType as string) || 'article';
  if (!RESOLVERS[entityType as SourceEntityType]) return null;

  const manualIdsStr = props.sourceManualIds as string | undefined;
  const manualIds = manualIdsStr ? manualIdsStr.split(',').filter(Boolean) : undefined;

  const filters: SourceFilter = {};
  if (props.sourceCategoryId) filters.categoryId = String(props.sourceCategoryId);
  if (props.sourceRodeoEventId) filters.rodeoEventId = String(props.sourceRodeoEventId);
  if (props.sourceEditionId) filters.editionId = String(props.sourceEditionId);
  if (props.sourceDisciplineId) filters.disciplineId = String(props.sourceDisciplineId);
  if (props.sourceFeatured === true || props.sourceFeatured === 'true') filters.featured = true;
  if (props.sourceUpcoming === true || props.sourceUpcoming === 'true') filters.upcoming = true;
  if (props.sourceVenueId) filters.venueId = String(props.sourceVenueId);

  return {
    mode: mode as SourceMode,
    entityType: entityType as SourceEntityType,
    manualIds,
    limit: typeof props.sourceLimit === 'number' ? props.sourceLimit : (props.sourceLimit ? Number(props.sourceLimit) : undefined),
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    fallbackPolicy: (props.sourceFallback as 'fill-auto' | 'hide-missing') || 'fill-auto',
    layoutVariant: props.sourceLayoutVariant as string | undefined,
    emptyBehavior: (props.sourceEmptyBehavior as 'collapse' | 'placeholder') || 'collapse',
  };
}
