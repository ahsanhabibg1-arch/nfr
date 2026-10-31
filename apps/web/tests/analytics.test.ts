import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as ArticleSvc from '../lib/cms/articleService';
import type * as AnalyticsSvc from '../lib/cms/analyticsService';
import type * as EventsSvc from '../lib/analytics/events';

/**
 * Batch 07 — analytics integration (§20 items 11–30). Exercises the REAL privacy
 * pipeline + dashboard service against the test DB: event validation, dedup, privacy
 * config gating, disabled-collection behavior, retention/deletion, aggregation,
 * date-range + previous-period comparison, RBAC + author scoping, provider
 * not-connected safety, content-gap detection and SEO integration. Self-skips without
 * DATABASE_URL.
 */
let available = false;
let prisma: PrismaClient;
let article: typeof ArticleSvc;
let analytics: typeof AnalyticsSvc;
let events: typeof EventsSvc;
let config: typeof import('../lib/analytics/config');
let limiter: typeof import('../lib/analytics/rateLimit');

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    available = true;
    article = await import('../lib/cms/articleService');
    analytics = await import('../lib/cms/analyticsService');
    events = await import('../lib/analytics/events');
    config = await import('../lib/analytics/config');
    limiter = await import('../lib/analytics/rateLimit');
    const roleSync = await import('../lib/auth/roleSync');
    const seed = await import('../lib/cms/analyticsSeed');
    const orch = await import('../lib/seo-intel/orchestrator');
    await roleSync.syncRolesAndPermissions(prisma);
    await seed.seedAnalyticsDefaults(prisma);
    await orch.syncSeoRules(prisma);
  } catch {
    available = false;
  }
}
const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

suite('Batch 07 — analytics & search intelligence', () => {
  const actors: Record<string, Actor> = {};
  const userIds: string[] = [];
  let artId = '';
  let findingId = '';

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({ data: { email: `b7an-${roleKey}-${rid()}@example.com`, name: `B7 ${roleKey}`, status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    userIds.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }
  const setCollection = (over: Partial<import('../lib/analytics/config').AnalyticsSettings> = {}) =>
    prisma.analyticsConfig.upsert({
      where: { key: config.ANALYTICS_CONFIG_KEY },
      create: { key: config.ANALYTICS_CONFIG_KEY, value: { ...config.DEFAULT_ANALYTICS_SETTINGS, collectionEnabled: true, ...over } },
      update: { value: { ...config.DEFAULT_ANALYTICS_SETTINGS, collectionEnabled: true, ...over } },
    });
  const ctx = () => ({ clientKey: `k-${rid()}` });

  beforeAll(async () => {
    actors.author = await makeUser('author');
    actors.editor = await makeUser('editor');
    actors.seomgr = await makeUser('seo_manager');
    actors.admin = await makeUser('administrator');
    limiter.__resetRateLimiterForTests();

    const saved = await article.saveArticle(actors.author as ArticleSvc.ActorContext, {
      slug: `b7an-${rid()}`,
      title: 'Analytics Test Dispatch',
      excerpt: 'A valid excerpt long enough to satisfy the publication gate checks for this analytics integration test case.',
      blocks: [{ type: 'paragraph', text: 'Opening paragraph with enough words to clear the minimum body length guidance threshold for the analyzer here.' }],
      categoryName: 'NFR Competition',
      authorName: 'Analytics Tester',
      imageRightsStatus: 'Staff Photo',
      imageAltText: 'Descriptive alt text for the analytics test photo.',
      seoTitle: 'Reasonable SEO Title For Analytics Test',
      metaDescription: 'A reasonable meta description within the configured guidance length for the analytics integration test case.',
    } as ArticleSvc.ArticleInput);
    artId = saved.id;
    await prisma.article.update({ where: { id: artId }, data: { workflowStatus: 'PUBLISHED', publishedAt: new Date() } });
  });

  afterAll(async () => {
    if (!available) return;
    await prisma.contentViewEvent.deleteMany({ where: { entityId: artId } }).catch(() => {});
    await prisma.searchResultClickEvent.deleteMany({ where: { entityId: artId } }).catch(() => {});
    await prisma.analyticsDailyAggregate.deleteMany({ where: { entityId: artId } }).catch(() => {});
    if (findingId) await prisma.seoFinding.delete({ where: { id: findingId } }).catch(() => {});
    if (artId) await prisma.article.delete({ where: { id: artId } }).catch(() => {});
    for (const id of userIds) {
      await prisma.userRole.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
    // Restore safe default (collection disabled).
    await prisma.analyticsConfig.upsert({
      where: { key: config.ANALYTICS_CONFIG_KEY },
      create: { key: config.ANALYTICS_CONFIG_KEY, value: { ...config.DEFAULT_ANALYTICS_SETTINGS } },
      update: { value: { ...config.DEFAULT_ANALYTICS_SETTINGS } },
    }).catch(() => {});
  });

  // ---- privacy config gating ----
  it('does not record when collection is disabled', async () => {
    await prisma.analyticsConfig.upsert({
      where: { key: config.ANALYTICS_CONFIG_KEY },
      create: { key: config.ANALYTICS_CONFIG_KEY, value: { ...config.DEFAULT_ANALYTICS_SETTINGS, collectionEnabled: false } },
      update: { value: { ...config.DEFAULT_ANALYTICS_SETTINGS, collectionEnabled: false } },
    });
    const r = await events.recordContentView(ctx(), { type: 'content_view', entityType: 'ARTICLE', entityId: artId, path: `/articles/x/` });
    expect(r.recorded).toBe(false);
    expect(r.reason).toBe('disabled');
    const count = await prisma.contentViewEvent.count({ where: { entityId: artId } });
    expect(count).toBe(0);
  });

  // ---- content view validation + dedup + aggregation ----
  it('records a valid content view and increments the daily aggregate', async () => {
    await setCollection();
    const r = await events.recordContentView(ctx(), { entityType: 'ARTICLE', entityId: artId, path: `/articles/x/` });
    expect(r.recorded).toBe(true);
    const agg = await prisma.analyticsDailyAggregate.findFirst({ where: { metric: 'content_view', entityType: 'ARTICLE', entityId: artId } });
    expect((agg?.count ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it('rejects an invalid / non-public entity id', async () => {
    await setCollection();
    const r = await events.recordContentView(ctx(), { entityType: 'ARTICLE', entityId: 'does-not-exist', path: '/x/' });
    expect(r.recorded).toBe(false);
    expect(r.reason).toBe('invalid');
  });

  it('suppresses rapid duplicate events (same client key)', async () => {
    await setCollection();
    const c = { clientKey: `dup-${rid()}` };
    const first = await events.recordContentView(c, { entityType: 'ARTICLE', entityId: artId, path: '/x/' });
    const second = await events.recordContentView(c, { entityType: 'ARTICLE', entityId: artId, path: '/x/' });
    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(false);
    expect(second.reason).toBe('duplicate');
  });

  // ---- search query + zero result + redaction ----
  it('records a search query and a zero-result signal', async () => {
    await setCollection();
    const before = await prisma.searchQueryEvent.count({ where: { zeroResult: true } });
    const r = await events.recordSearchQuery(ctx(), { query: 'zzgapterm rodeo guide', resultCount: 0, zeroResult: true });
    expect(r.recorded).toBe(true);
    const after = await prisma.searchQueryEvent.count({ where: { zeroResult: true } });
    expect(after).toBe(before + 1);
  });

  it('redacts emails in stored queries', async () => {
    await setCollection({ redactQueries: true });
    await events.recordSearchQuery(ctx(), { query: 'email me at tester@example.com', resultCount: 1, zeroResult: false });
    const row = await prisma.searchQueryEvent.findFirst({ where: { normalizedQuery: { contains: '[email]' } }, orderBy: { createdAt: 'desc' } });
    expect(row).not.toBeNull();
  });

  // ---- click validation ----
  it('validates and records a search result click', async () => {
    await setCollection();
    const ok = await events.recordSearchClick(ctx(), { query: 'analytics', entityType: 'ARTICLE', entityId: artId, position: 1 });
    expect(ok.recorded).toBe(true);
    const bad = await events.recordSearchClick(ctx(), { query: 'analytics', entityType: 'ARTICLE', entityId: 'nope', position: 1 });
    expect(bad.recorded).toBe(false);
  });

  // ---- RBAC + author scoping ----
  it('enforces RBAC on search intelligence and content gaps', async () => {
    await expect(analytics.getSearchAnalytics(actors.author, 30)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(analytics.getContentGaps(actors.author, 90)).rejects.toMatchObject({ code: 'forbidden' });
    const ed = await analytics.getSearchAnalytics(actors.editor, 30);
    expect(ed.active).toBe(true);
  });

  it('scopes overview to own content for an author', async () => {
    const authorView = await analytics.getAnalyticsOverview(actors.author, 30);
    const editorView = await analytics.getAnalyticsOverview(actors.editor, 30);
    expect(authorView.scopedToOwn).toBe(true);
    expect(authorView.canViewSearch).toBe(false);
    expect(authorView.searches).toBeNull();
    expect(editorView.scopedToOwn).toBe(false);
    expect(editorView.searches).not.toBeNull();
  });

  it('enforces RBAC on config changes', async () => {
    await expect(
      analytics.updateAnalyticsConfig(actors.editor, { ...config.DEFAULT_ANALYTICS_SETTINGS, collectionEnabled: true }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const saved = await analytics.updateAnalyticsConfig(actors.admin, { ...config.DEFAULT_ANALYTICS_SETTINGS, collectionEnabled: true });
    expect(saved.collectionEnabled).toBe(true);
  });

  // ---- previous-period comparison ----
  it('marks previous-period comparison insufficient when there is no prior data', async () => {
    const ov = await analytics.getAnalyticsOverview(actors.admin, 7);
    // All events in this suite are "now"; the prior 7-day window has none.
    expect(ov.contentViews.insufficient).toBe(true);
    expect(ov.contentViews.changePct).toBeNull();
  });

  // ---- date-range filtering (via backdated aggregate) ----
  it('respects the date range in overview totals', async () => {
    // ~100 days ago: inside the 400-day window, outside the 7-day window.
    const past = new Date(Date.now() - 100 * 86_400_000);
    const oldDay = new Date(Date.UTC(past.getUTCFullYear(), past.getUTCMonth(), past.getUTCDate()));
    await prisma.analyticsDailyAggregate.upsert({
      where: { day_metric_entityType_entityId: { day: oldDay, metric: 'content_view', entityType: 'ARTICLE', entityId: artId } },
      create: { day: oldDay, metric: 'content_view', entityType: 'ARTICLE', entityId: artId, count: 999 },
      update: { count: 999 },
    });
    const recent = await analytics.getAnalyticsOverview(actors.admin, 7);
    const all = await analytics.getAnalyticsOverview(actors.admin, 400);
    expect(all.contentViews.current).toBeGreaterThan(recent.contentViews.current);
  });

  // ---- providers ----
  it('reports external providers as not connected and never live', async () => {
    const rows = await analytics.getProviderStatuses(actors.admin);
    const gsc = rows.find((r) => r.provider === 'GOOGLE_SEARCH_CONSOLE');
    const ga4 = rows.find((r) => r.provider === 'GOOGLE_ANALYTICS_4');
    expect(gsc?.live).toBe(false);
    expect(ga4?.live).toBe(false);
    const sync = await analytics.runProviderSync(actors.seomgr, 'GOOGLE_SEARCH_CONSOLE');
    expect(sync.status).toBe('not_connected');
    await expect(analytics.setProviderConnection(actors.author, 'GA4' as never, {})).rejects.toBeTruthy();
  });

  // ---- content gaps ----
  it('detects a content gap from real zero-result evidence', async () => {
    await setCollection();
    for (let i = 0; i < 3; i++) await events.recordSearchQuery({ clientKey: `gap-${i}-${rid()}` }, { query: 'zzgapterm rodeo guide', resultCount: 0, zeroResult: true });
    const { gaps } = await analytics.getContentGaps(actors.seomgr, 90);
    const g = gaps.find((x) => x.term.includes('zzgapterm'));
    expect(g).toBeTruthy();
    expect(g?.missingCoverage).toBe(true);
  });

  // ---- SEO integration ----
  it('surfaces search-informed SEO (demand + open findings) advisorily', async () => {
    await setCollection();
    const rule = await prisma.seoRule.findFirstOrThrow();
    const finding = await prisma.seoFinding.create({
      data: {
        ruleId: rule.id, ruleCode: rule.code, fingerprint: `b7an-${rid()}`,
        category: 'content', severity: 'MEDIUM', status: 'OPEN', kind: 'DEFECT',
        entityType: 'article', articleId: artId, evidence: 'test finding',
      },
    });
    findingId = finding.id;
    // clicks give the article real search demand
    for (let i = 0; i < 2; i++) await events.recordSearchClick({ clientKey: `seo-${i}-${rid()}` }, { query: 'analytics dispatch', entityType: 'ARTICLE', entityId: artId, position: 1 });
    const seoLink = await analytics.getSearchInformedSeo(actors.editor, 90);
    expect(seoLink.highDemandIncompleteMeta.some((a) => a.articleId === artId)).toBe(true);
  });

  // ---- retention / deletion ----
  it('prunes raw events past the retention window and keeps aggregates', async () => {
    const old = new Date(Date.UTC(2019, 0, 1));
    const ev = await prisma.contentViewEvent.create({ data: { entityType: 'ARTICLE', entityId: artId, path: '/old/', createdAt: old } });
    await analytics.updateAnalyticsConfig(actors.admin, { ...config.DEFAULT_ANALYTICS_SETTINGS, collectionEnabled: true, retentionDays: 30 });
    const res = await analytics.runRetention(actors.admin);
    expect(res.deleted.contentView).toBeGreaterThanOrEqual(1);
    const stillThere = await prisma.contentViewEvent.findUnique({ where: { id: ev.id } });
    expect(stillThere).toBeNull();
    // the durable aggregate is preserved
    const agg = await prisma.analyticsDailyAggregate.findFirst({ where: { metric: 'content_view', entityId: artId } });
    expect(agg).not.toBeNull();
  });
});
