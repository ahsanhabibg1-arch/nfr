import 'server-only';
import { z } from 'zod';
import type { AnalyticsEntityType, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import {
  getAnalyticsSettings,
  ANALYTICS_CONFIG_KEY,
  DEFAULT_ANALYTICS_SETTINGS,
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  type AnalyticsSettings,
} from '../analytics/config';
import { describeAllProviders, PROVIDERS, type ExternalProviderKey } from '../analytics/providers';
import { ANALYTICS_METRICS } from '../analytics/events';

/**
 * Analytics & Search Intelligence service (Batch 07 §10–§16). Default-deny RBAC +
 * audit on every privileged read/mutation. Reads prefer the durable daily aggregates
 * for totals/top-content (fast, survive retention) and raw events for term-level
 * detail (bounded by the retention window). All time handling is UTC; the dashboard
 * documents UTC as the single display zone (§19). NO metric is fabricated — empty,
 * disabled and not-connected states are surfaced honestly.
 *
 * Authors (analytics.view only) are scoped to their OWN articles. Site-wide internal
 * search intelligence requires search.analytics.view.
 */
const { M_VIEW, M_SEARCH, M_ZERO, M_CLICK } = ANALYTICS_METRICS;

const need = (a: Actor, p: Parameters<typeof roleHasPermission>[1]) => {
  if (!roleHasPermission(a.roles, p)) throw new ServiceError('forbidden', `Not permitted (${p}).`);
};
const canViewSearch = (a: Actor) => roleHasPermission(a.roles, 'search.analytics.view');
const canViewAllContent = (a: Actor) =>
  roleHasPermission(a.roles, 'search.analytics.view') ||
  roleHasPermission(a.roles, 'analytics.config') ||
  roleHasPermission(a.roles, 'analytics.export');

export interface DateRange {
  from: Date;
  to: Date;
  days: number;
}
export function resolveRange(days: number): DateRange {
  const d = Math.min(MAX_RETENTION_DAYS, Math.max(1, Math.floor(Number(days) || 30)));
  const to = new Date();
  const from = new Date(to.getTime() - d * 86_400_000);
  return { from, to, days: d };
}
function prevRange(r: DateRange): DateRange {
  return { from: new Date(r.from.getTime() - r.days * 86_400_000), to: r.from, days: r.days };
}
function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function ownArticleIds(actor: Actor): Promise<string[]> {
  const rows = await prisma.article.findMany({ where: { createdById: actor.id }, select: { id: true } });
  return rows.map((r) => r.id);
}

async function metricTotal(metric: string, r: DateRange, entityIds?: string[]): Promise<number> {
  const res = await prisma.analyticsDailyAggregate.aggregate({
    _sum: { count: true },
    where: {
      metric,
      day: { gte: utcDay(r.from), lte: utcDay(r.to) },
      ...(entityIds ? { entityId: { in: entityIds } } : {}),
    },
  });
  return res._sum.count ?? 0;
}

export interface MetricComparison {
  current: number;
  previous: number;
  changePct: number | null; // null when the previous period has no data (§10)
  insufficient: boolean;
}
function compare(current: number, previous: number): MetricComparison {
  if (previous <= 0) return { current, previous, changePct: null, insufficient: true };
  return { current, previous, changePct: ((current - previous) / previous) * 100, insufficient: false };
}

// ---------------- Overview ----------------
export interface AnalyticsOverview {
  collection: AnalyticsSettings;
  range: { from: string; to: string; days: number; timeZone: string };
  scopedToOwn: boolean;
  canViewSearch: boolean;
  contentViews: MetricComparison;
  searches: MetricComparison | null; // null when not permitted to view search intelligence
  zeroResults: MetricComparison | null;
  searchClicks: MetricComparison | null;
  topContent: { entityType: string; entityId: string; title: string; url: string; views: number }[];
  observedNote: string;
}

async function resolveEntityMeta(
  pairs: { entityType: string; entityId: string }[],
): Promise<Map<string, { title: string; url: string }>> {
  const map = new Map<string, { title: string; url: string }>();
  const articleIds = pairs.filter((p) => p.entityType === 'ARTICLE').map((p) => p.entityId);
  const discIds = pairs.filter((p) => p.entityType === 'DISCIPLINE').map((p) => p.entityId);
  if (articleIds.length) {
    const rows = await prisma.article.findMany({ where: { id: { in: articleIds } }, select: { id: true, title: true, slug: true } });
    for (const a of rows) map.set(`ARTICLE:${a.id}`, { title: a.title, url: `/articles/${a.slug}/` });
  }
  if (discIds.length) {
    const rows = await prisma.discipline.findMany({ where: { id: { in: discIds } }, select: { id: true, name: true, slug: true } });
    for (const d of rows) map.set(`DISCIPLINE:${d.id}`, { title: d.name, url: `/disciplines/${d.slug}/` });
  }
  return map;
}

export async function getAnalyticsOverview(actor: Actor, days = 30): Promise<AnalyticsOverview> {
  need(actor, 'analytics.view');
  const settings = await getAnalyticsSettings();
  const r = resolveRange(days);
  const p = prevRange(r);
  const scoped = !canViewAllContent(actor);
  const ids = scoped ? await ownArticleIds(actor) : undefined;

  const [cvNow, cvPrev] = await Promise.all([metricTotal(M_VIEW, r, ids), metricTotal(M_VIEW, p, ids)]);

  let searches: MetricComparison | null = null;
  let zeroResults: MetricComparison | null = null;
  let searchClicks: MetricComparison | null = null;
  if (canViewSearch(actor)) {
    const [sN, sP, zN, zP, cN, cP] = await Promise.all([
      metricTotal(M_SEARCH, r), metricTotal(M_SEARCH, p),
      metricTotal(M_ZERO, r), metricTotal(M_ZERO, p),
      metricTotal(M_CLICK, r), metricTotal(M_CLICK, p),
    ]);
    searches = compare(sN, sP);
    zeroResults = compare(zN, zP);
    searchClicks = compare(cN, cP);
  }

  const topRows = await prisma.analyticsDailyAggregate.groupBy({
    by: ['entityType', 'entityId'],
    where: {
      metric: M_VIEW,
      day: { gte: utcDay(r.from), lte: utcDay(r.to) },
      NOT: { entityId: '' },
      ...(ids ? { entityId: { in: ids } } : {}),
    },
    _sum: { count: true },
    orderBy: { _sum: { count: 'desc' } },
    take: 10,
  });
  const meta = await resolveEntityMeta(topRows.map((t) => ({ entityType: t.entityType, entityId: t.entityId })));
  const topContent = topRows.map((t) => {
    const m = meta.get(`${t.entityType}:${t.entityId}`);
    return {
      entityType: t.entityType,
      entityId: t.entityId,
      title: m?.title ?? '(removed content)',
      url: m?.url ?? '#',
      views: t._sum.count ?? 0,
    };
  });

  return {
    collection: settings,
    range: { from: r.from.toISOString(), to: r.to.toISOString(), days: r.days, timeZone: settings.displayTimeZone },
    scopedToOwn: scoped,
    canViewSearch: canViewSearch(actor),
    contentViews: compare(cvNow, cvPrev),
    searches,
    zeroResults,
    searchClicks,
    topContent,
    observedNote: 'Page views are first-party observed events, not verified unique human visitors.',
  };
}

// ---------------- Internal search analytics ----------------
export interface SearchAnalytics {
  active: boolean;
  topTerms: { term: string; searches: number; clicks: number; ctrPct: number | null; avgResults: number }[];
  zeroResultTerms: { term: string; searches: number }[];
  weakEngagement: { term: string; searches: number; clicks: number }[];
  demandByType: { contentType: string; searches: number }[];
  totals: { searches: number; zeroResults: number; clicks: number; ctrPct: number | null };
}

export async function getSearchAnalytics(actor: Actor, days = 30): Promise<SearchAnalytics> {
  need(actor, 'search.analytics.view');
  const r = resolveRange(days);
  const where = { createdAt: { gte: r.from, lte: r.to } };

  const [termGroups, zeroGroups, clickGroups, typeGroups, totalSearches, totalZero, totalClicks] = await Promise.all([
    prisma.searchQueryEvent.groupBy({
      by: ['normalizedQuery'],
      where,
      _count: { _all: true },
      _sum: { resultCount: true },
      orderBy: { _count: { normalizedQuery: 'desc' } },
      take: 20,
    }),
    prisma.searchQueryEvent.groupBy({
      by: ['normalizedQuery'],
      where: { ...where, zeroResult: true },
      _count: { _all: true },
      orderBy: { _count: { normalizedQuery: 'desc' } },
      take: 20,
    }),
    prisma.searchResultClickEvent.groupBy({
      by: ['normalizedQuery'],
      where,
      _count: { _all: true },
    }),
    prisma.searchQueryEvent.groupBy({
      by: ['contentType'],
      where,
      _count: { _all: true },
      orderBy: { _count: { contentType: 'desc' } },
    }),
    prisma.searchQueryEvent.count({ where }),
    prisma.searchQueryEvent.count({ where: { ...where, zeroResult: true } }),
    prisma.searchResultClickEvent.count({ where }),
  ]);

  const clicksByTerm = new Map<string, number>();
  for (const c of clickGroups) clicksByTerm.set(c.normalizedQuery, c._count._all);

  const topTerms = termGroups.map((t) => {
    const searches = t._count._all;
    const clicks = clicksByTerm.get(t.normalizedQuery) ?? 0;
    return {
      term: t.normalizedQuery,
      searches,
      clicks,
      ctrPct: searches > 0 ? (clicks / searches) * 100 : null,
      avgResults: searches > 0 ? Math.round(((t._sum.resultCount ?? 0) / searches) * 10) / 10 : 0,
    };
  });

  const weakEngagement = topTerms
    .filter((t) => t.searches >= 3 && t.clicks === 0)
    .sort((a, b) => b.searches - a.searches)
    .slice(0, 10)
    .map((t) => ({ term: t.term, searches: t.searches, clicks: t.clicks }));

  return {
    active: true,
    topTerms,
    zeroResultTerms: zeroGroups.map((z) => ({ term: z.normalizedQuery, searches: z._count._all })),
    weakEngagement,
    demandByType: typeGroups.map((g) => ({ contentType: g.contentType ?? '(none)', searches: g._count._all })),
    totals: {
      searches: totalSearches,
      zeroResults: totalZero,
      clicks: totalClicks,
      ctrPct: totalSearches > 0 ? (totalClicks / totalSearches) * 100 : null,
    },
  };
}

// ---------------- Content & entity performance ----------------
export interface ContentPerformanceRow {
  entityType: string;
  entityId: string;
  title: string;
  url: string;
  views: number;
  searchClicks: number;
  seoOpenIssues: number;
  lastUpdated: string | null;
  ageDays: number | null;
}

export async function getContentPerformance(actor: Actor, days = 30): Promise<{ rows: ContentPerformanceRow[]; scopedToOwn: boolean }> {
  need(actor, 'analytics.view');
  const r = resolveRange(days);
  const scoped = !canViewAllContent(actor);
  const ids = scoped ? await ownArticleIds(actor) : undefined;

  const [viewRows, clickRows] = await Promise.all([
    prisma.analyticsDailyAggregate.groupBy({
      by: ['entityType', 'entityId'],
      where: { metric: M_VIEW, day: { gte: utcDay(r.from), lte: utcDay(r.to) }, NOT: { entityId: '' }, ...(ids ? { entityId: { in: ids } } : {}) },
      _sum: { count: true },
    }),
    prisma.analyticsDailyAggregate.groupBy({
      by: ['entityType', 'entityId'],
      where: { metric: M_CLICK, day: { gte: utcDay(r.from), lte: utcDay(r.to) }, NOT: { entityId: '' }, ...(ids ? { entityId: { in: ids } } : {}) },
      _sum: { count: true },
    }),
  ]);

  const agg = new Map<string, { entityType: string; entityId: string; views: number; clicks: number }>();
  for (const v of viewRows) agg.set(`${v.entityType}:${v.entityId}`, { entityType: v.entityType, entityId: v.entityId, views: v._sum.count ?? 0, clicks: 0 });
  for (const c of clickRows) {
    const k = `${c.entityType}:${c.entityId}`;
    const e = agg.get(k) ?? { entityType: c.entityType, entityId: c.entityId, views: 0, clicks: 0 };
    e.clicks = c._sum.count ?? 0;
    agg.set(k, e);
  }

  const pairs = [...agg.values()];
  const articleIds = pairs.filter((p) => p.entityType === 'ARTICLE').map((p) => p.entityId);
  const [meta, seoCounts, articleDates] = await Promise.all([
    resolveEntityMeta(pairs),
    articleIds.length
      ? prisma.seoFinding.groupBy({ by: ['articleId'], where: { articleId: { in: articleIds }, status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] } }, _count: { _all: true } })
      : Promise.resolve([] as { articleId: string | null; _count: { _all: number } }[]),
    articleIds.length
      ? prisma.article.findMany({ where: { id: { in: articleIds } }, select: { id: true, updatedAt: true, publishedAt: true } })
      : Promise.resolve([] as { id: string; updatedAt: Date; publishedAt: Date | null }[]),
  ]);
  const seoByArticle = new Map<string, number>();
  for (const s of seoCounts) if (s.articleId) seoByArticle.set(s.articleId, s._count._all);
  const dateByArticle = new Map(articleDates.map((a) => [a.id, a]));

  const rows: ContentPerformanceRow[] = pairs
    .map((p) => {
      const m = meta.get(`${p.entityType}:${p.entityId}`);
      const dates = p.entityType === 'ARTICLE' ? dateByArticle.get(p.entityId) : undefined;
      const published = dates?.publishedAt ?? null;
      return {
        entityType: p.entityType,
        entityId: p.entityId,
        title: m?.title ?? '(removed content)',
        url: m?.url ?? '#',
        views: p.views,
        searchClicks: p.clicks,
        seoOpenIssues: p.entityType === 'ARTICLE' ? seoByArticle.get(p.entityId) ?? 0 : 0,
        lastUpdated: dates?.updatedAt?.toISOString() ?? null,
        ageDays: published ? Math.floor((Date.now() - published.getTime()) / 86_400_000) : null,
      };
    })
    .sort((a, b) => b.views - a.views || b.searchClicks - a.searchClicks)
    .slice(0, 50);

  return { rows, scopedToOwn: scoped };
}

// ---------------- Content-gap intelligence (§12) ----------------
export interface ContentGap {
  term: string;
  demand: number;
  evidence: string;
  existingCoverage: { title: string; url: string }[];
  missingCoverage: boolean;
  suggestedAction: string;
}

export async function getContentGaps(actor: Actor, days = 90): Promise<{ gaps: ContentGap[]; periodDays: number; evidenceCount: number }> {
  need(actor, 'search.analytics.view');
  const r = resolveRange(days);
  const where = { createdAt: { gte: r.from, lte: r.to } };

  const [zeroGroups, totalEvidence] = await Promise.all([
    prisma.searchQueryEvent.groupBy({
      by: ['normalizedQuery'],
      where: { ...where, zeroResult: true },
      _count: { _all: true },
      orderBy: { _count: { normalizedQuery: 'desc' } },
      take: 12,
    }),
    prisma.searchQueryEvent.count({ where }),
  ]);

  const gaps: ContentGap[] = [];
  for (const g of zeroGroups) {
    const term = g.normalizedQuery;
    if (term.startsWith('[')) continue; // redaction placeholder — not an editorial signal
    // Cross-reference existing published coverage by a bounded title/excerpt match.
    const existing = await prisma.article.findMany({
      where: {
        workflowStatus: 'PUBLISHED',
        OR: [{ title: { contains: term, mode: 'insensitive' } }, { excerpt: { contains: term, mode: 'insensitive' } }],
      },
      select: { title: true, slug: true },
      take: 3,
    });
    const missing = existing.length === 0;
    gaps.push({
      term,
      demand: g._count._all,
      evidence: `${g._count._all} zero-result search(es) in the last ${r.days} days`,
      existingCoverage: existing.map((a) => ({ title: a.title, url: `/articles/${a.slug}/` })),
      missingCoverage: missing,
      suggestedAction: missing
        ? `No published article matches "${term}". Consider commissioning coverage.`
        : `Coverage exists but did not surface for "${term}" — review titles/metadata/internal links.`,
    });
  }

  return { gaps, periodDays: r.days, evidenceCount: totalEvidence };
}

// ---------------- SEO Intelligence integration (§15) ----------------
export interface SearchInformedSeo {
  highDemandIncompleteMeta: { articleId: string; title: string; url: string; searchClicks: number; openFindings: number }[];
  note: string;
}

export async function getSearchInformedSeo(actor: Actor, days = 90): Promise<SearchInformedSeo> {
  need(actor, 'search.analytics.view');
  const r = resolveRange(days);
  const clicked = await prisma.analyticsDailyAggregate.groupBy({
    by: ['entityId'],
    where: { metric: M_CLICK, entityType: 'ARTICLE', day: { gte: utcDay(r.from), lte: utcDay(r.to) }, NOT: { entityId: '' } },
    _sum: { count: true },
    orderBy: { _sum: { count: 'desc' } },
    take: 25,
  });
  const ids = clicked.map((c) => c.entityId);
  const findings = ids.length
    ? await prisma.seoFinding.groupBy({
        by: ['articleId'],
        where: { articleId: { in: ids }, status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] }, category: { in: ['content', 'structured_data', 'technical', 'image'] } },
        _count: { _all: true },
      })
    : [];
  const findingByArticle = new Map<string, number>();
  for (const f of findings) if (f.articleId) findingByArticle.set(f.articleId, f._count._all);
  const withIssues = ids.filter((id) => (findingByArticle.get(id) ?? 0) > 0);
  const meta = withIssues.length ? await prisma.article.findMany({ where: { id: { in: withIssues } }, select: { id: true, title: true, slug: true } }) : [];
  const clicksById = new Map(clicked.map((c) => [c.entityId, c._sum.count ?? 0]));

  return {
    highDemandIncompleteMeta: meta.map((a) => ({
      articleId: a.id,
      title: a.title,
      url: `/articles/${a.slug}/`,
      searchClicks: clicksById.get(a.id) ?? 0,
      openFindings: findingByArticle.get(a.id) ?? 0,
    })).sort((x, y) => y.searchClicks - x.searchClicks),
    note: 'Advisory observation only: articles with real search demand that still have open SEO findings. The 37 SEO rules are unchanged.',
  };
}

// ---------------- Providers ----------------
export interface ProviderStatusRow {
  provider: string;
  displayName: string;
  kind: string;
  state: string;
  detail: string;
  live: boolean;
  requiredEnv: string[];
  lastSyncAt: string | null;
  propertyRef: string | null;
}

export async function getProviderStatuses(actor: Actor): Promise<ProviderStatusRow[]> {
  need(actor, 'analytics.view');
  const described = describeAllProviders();
  const stored = await prisma.analyticsProviderConnection.findMany();
  const byProvider = new Map(stored.map((s) => [s.provider, s]));
  return described.map((d) => {
    const row = byProvider.get(d.provider);
    return {
      provider: d.provider,
      displayName: d.displayName,
      kind: d.kind,
      state: row?.status ? row.status.toLowerCase() : d.state,
      detail: d.detail,
      live: d.live,
      requiredEnv: d.requiredEnv,
      lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
      propertyRef: row?.propertyRef ?? null,
    };
  });
}

const ProviderPatch = z.object({
  propertyRef: z.string().max(256).nullable().optional(),
  enabled: z.boolean().optional(),
});
export type ProviderPatchInput = z.input<typeof ProviderPatch>;

/** Record a provider's non-secret reference label. Never stores credentials and never
 * marks a provider CONNECTED (live sync stays owner-gated, §13/§24). */
export async function setProviderConnection(actor: Actor, provider: ExternalProviderKey, raw: ProviderPatchInput): Promise<void> {
  need(actor, 'analytics.provider.manage');
  if (!PROVIDERS[provider]) throw new ServiceError('not_found', 'Unknown provider');
  const v = ProviderPatch.parse(raw);
  const displayName = PROVIDERS[provider].displayName;
  const status = v.enabled ? 'CONFIGURED' : 'NOT_CONNECTED';
  await prisma.analyticsProviderConnection.upsert({
    where: { provider },
    create: { provider, displayName, propertyRef: v.propertyRef ?? null, configuredById: actor.id, status },
    update: { propertyRef: v.propertyRef ?? null, configuredById: actor.id, status },
  });
  await audit(actor.id, 'analytics.provider.config', 'analytics_provider', provider, status);
}

/** Attempt a provider sync. No credentials/approval ⇒ records a not_connected run and
 * reports honestly. No network call is made. */
export async function runProviderSync(actor: Actor, provider: ExternalProviderKey): Promise<{ status: string; message: string }> {
  need(actor, 'analytics.provider.manage');
  if (!PROVIDERS[provider]) throw new ServiceError('not_found', 'Unknown provider');
  const conn = await prisma.analyticsProviderConnection.upsert({
    where: { provider },
    create: { provider, displayName: PROVIDERS[provider].displayName, status: 'NOT_CONNECTED' },
    update: {},
  });
  await prisma.analyticsSyncRun.create({
    data: { connectionId: conn.id, provider, status: 'not_connected', completedAt: new Date(), errorCategory: 'not_connected' },
  });
  await audit(actor.id, 'analytics.provider.sync', 'analytics_provider', provider, 'not_connected');
  return { status: 'not_connected', message: `${PROVIDERS[provider].displayName} is not connected. Live sync requires authorized credentials and owner approval.` };
}

// ---------------- Config ----------------
export async function getAnalyticsConfig(actor: Actor): Promise<AnalyticsSettings> {
  need(actor, 'analytics.view');
  return getAnalyticsSettings();
}

const SettingsInput = z.object({
  collectionEnabled: z.boolean(),
  searchLoggingEnabled: z.boolean(),
  contentViewEnabled: z.boolean(),
  retentionDays: z.number().int().min(MIN_RETENTION_DAYS).max(MAX_RETENTION_DAYS),
  redactQueries: z.boolean(),
  displayTimeZone: z.string().min(1).max(64),
});
export type SettingsInput = z.input<typeof SettingsInput>;

export async function updateAnalyticsConfig(actor: Actor, raw: SettingsInput): Promise<AnalyticsSettings> {
  need(actor, 'analytics.config');
  const v = SettingsInput.parse(raw);
  const value: AnalyticsSettings = { ...DEFAULT_ANALYTICS_SETTINGS, ...v };
  const json = value as unknown as Prisma.InputJsonObject;
  await prisma.analyticsConfig.upsert({
    where: { key: ANALYTICS_CONFIG_KEY },
    create: { key: ANALYTICS_CONFIG_KEY, value: json, updatedById: actor.id },
    update: { value: json, updatedById: actor.id },
  });
  await audit(actor.id, 'analytics.config.update', 'analytics_config', ANALYTICS_CONFIG_KEY, value.collectionEnabled ? 'collection-enabled' : 'collection-disabled');
  return value;
}

// ---------------- Export (§10/§16) ----------------
export async function exportAnalytics(actor: Actor, days = 30): Promise<{ generatedAt: string; range: { from: string; to: string; days: number }; aggregates: { day: string; metric: string; entityType: string; entityId: string; count: number }[] }> {
  need(actor, 'analytics.export');
  const r = resolveRange(days);
  const rows = await prisma.analyticsDailyAggregate.findMany({
    where: { day: { gte: utcDay(r.from), lte: utcDay(r.to) } },
    orderBy: [{ day: 'asc' }, { metric: 'asc' }],
    take: 5000,
  });
  await audit(actor.id, 'analytics.export', 'analytics', 'aggregates', `${r.days}d`);
  return {
    generatedAt: new Date().toISOString(),
    range: { from: r.from.toISOString(), to: r.to.toISOString(), days: r.days },
    aggregates: rows.map((x) => ({ day: x.day.toISOString().slice(0, 10), metric: x.metric, entityType: x.entityType, entityId: x.entityId, count: x.count })),
  };
}

// ---------------- Retention (§8/§9) ----------------
/** Aggregate is already maintained at write time; here we prune RAW events older than
 * the retention window while preserving the durable daily aggregates. Returns counts. */
export async function runRetention(actor?: Actor): Promise<{ cutoff: string; deleted: { searchQuery: number; searchClick: number; contentView: number } }> {
  if (actor) need(actor, 'analytics.config');
  const settings = await getAnalyticsSettings();
  const cutoff = new Date(Date.now() - settings.retentionDays * 86_400_000);
  const [sq, sc, cv] = await prisma.$transaction([
    prisma.searchQueryEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.searchResultClickEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.contentViewEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);
  if (actor) await audit(actor.id, 'analytics.retention.prune', 'analytics', 'raw_events', `cutoff=${cutoff.toISOString()}`);
  return { cutoff: cutoff.toISOString(), deleted: { searchQuery: sq.count, searchClick: sc.count, contentView: cv.count } };
}

export type { AnalyticsSettings } from '../analytics/config';
