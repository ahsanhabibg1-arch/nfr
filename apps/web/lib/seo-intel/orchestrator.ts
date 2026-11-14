import 'server-only';
import crypto from 'node:crypto';
import type { PrismaClient, Prisma, SeoSeverity, SeoFindingKind } from '@prisma/client';
import { RULES, RULE_BY_CODE, SEO_ENGINE_VERSION, DEFAULT_THRESHOLDS, Thresholds } from './rules';
import { SITE_URL } from '../seo';
import { isHiddenFixtureSlug } from '../fixturePolicy';
import { loadSitemapCandidates, evaluateSitemap } from '../seo/sitemapEntries';
import { buildRouteIndex, extractLinkCandidates, routeFirstSegments, RENDERS_PUBLICLY, classifyLink } from '../seo/routeIndex';
import { collectArticleLinks, countArticleLinks, type ArticleLink } from '../seo/articleLinkInventory';
import { acquireAuditLock, AuditLockError, FULL_SCOPE, type AcquireResult, type AuditLockHandle } from './auditLock';
import { log } from '../logger';
import { AuditScope, RawFinding } from './types';
import { Inventory, ArticleInv, MediaInv, runAnalyzers } from './analyzers';

/**
 * SEO audit orchestrator (Batch 06 §3/§17). Builds a bounded inventory from the
 * database, runs the deterministic analyzers, and persists findings with stable
 * fingerprints (dedup), reopening resolved defects that reappear and verified
 * auto-resolution of defects that no longer appear in scope. No network calls.
 */

const fingerprint = (f: RawFinding): string =>
  crypto.createHash('sha1').update([f.ruleCode, f.entityType, f.entityId ?? '', f.discriminator ?? ''].join('|')).digest('hex');

/** Collect every string value of a block's JSON (link extraction runs over these). */
function blockStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) blockStrings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value as Record<string, unknown>)) blockStrings(v, out);
}

/** Idempotently mirror the rule registry into SeoRule (code is the stable key). */
export async function syncSeoRules(db: PrismaClient): Promise<void> {
  for (const r of RULES) {
    await db.seoRule.upsert({
      where: { code: r.code },
      update: { group: r.category, category: r.category, title: r.title, severity: r.severity as SeoSeverity, defaultKind: r.kind as SeoFindingKind, description: r.description },
      create: { code: r.code, group: r.category, category: r.category, title: r.title, severity: r.severity as SeoSeverity, defaultKind: r.kind as SeoFindingKind, description: r.description, ruleVersion: '1' },
    });
  }
}

async function getThresholds(db: PrismaClient): Promise<Thresholds> {
  const row = await db.seoConfig.findUnique({ where: { key: 'thresholds' } });
  return { ...DEFAULT_THRESHOLDS, ...((row?.value as Partial<Thresholds>) ?? {}) };
}

export async function buildInventory(db: PrismaClient): Promise<Inventory> {
  // Batch S6: the S4 sitemap evaluation (a constant number of batched queries, run once per
  // audit) is the authority for sitemap state and for most route outcomes.
  const sitemapEvalP = loadSitemapCandidates().then((c) => evaluateSitemap(c, SITE_URL));
  const competitorSlugsP = db.competitor.findMany({ select: { slug: true } });
  const [articles, relations, hubs, events, editions, disciplines, venues, categories, redirects, media] = await Promise.all([
    db.article.findMany({
      select: {
        id: true, slug: true, title: true, excerpt: true, workflowStatus: true, categoryId: true, publishedAt: true,
        heroImageUrl: true, imageAltText: true, imageSeoTitle: true, createdById: true,
        category: { select: { name: true } }, author: { select: { name: true } },
        seo: { select: { seoTitle: true, metaDescription: true, canonicalUrl: true, ogImage: true, robots: true } },
        blocks: { select: { blockType: true, data: true }, orderBy: { sortOrder: 'asc' } },
        disciplines: { select: { discipline: { select: { slug: true } } } },
        hubs: { select: { hubId: true } }, events: { select: { eventId: true } },
        editions: { select: { edition: { select: { id: true, eventId: true } } } },
        _count: { select: { sources: true } },
      },
    }),
    db.articleRelation.findMany({ select: { sourceId: true, targetId: true } }),
    db.rodeoHub.findMany({ select: { id: true, slug: true, title: true, _count: { select: { articles: true } } } }),
    db.rodeoEvent.findMany({ select: { id: true, slug: true, name: true, _count: { select: { editions: true } } } }),
    db.rodeoEventEdition.findMany({ select: { id: true, editionSlug: true, eventId: true, year: true, venueId: true, event: { select: { name: true } }, _count: { select: { articles: true } } } }),
    db.discipline.findMany({ select: { id: true, slug: true, name: true } }),
    db.venue.findMany({ select: { id: true, slug: true, name: true } }),
    db.category.findMany({ select: { id: true, slug: true, name: true } }),
    db.articleRedirect.findMany({ where: { status: 'ACTIVE' }, select: { sourcePath: true, targetPath: true } }),
    db.mediaAsset.findMany({ select: { url: true, id: true, visibility: true, rightsConfirmed: true, storageProvider: true, altText: true, seoTitle: true, width: true, height: true } }),
  ]);

  const relBySource = new Map<string, string[]>();
  for (const r of relations) relBySource.set(r.sourceId, [...(relBySource.get(r.sourceId) || []), r.targetId]);

  const blockTextsById = new Map<string, string[]>();
  const hrefsById = new Map<string, string[]>();
  const bodyLinksById = new Map<string, ArticleLink[]>();
  const artInv: ArticleInv[] = articles.map((a) => {
    const headings: string[] = [];
    let bodyWords = 0;
    const strings: string[] = [];
    const hrefs: string[] = [];
    /**
     * Batch 06 — the DELIBERATE link inventory, read from the fields that
     * actually carry links (`runs`, `quoteRuns`, `itemRuns`, `sourceLink.url`)
     * so the analysis sees exactly what `InlineText` renders.
     *
     * The legacy string scan below is kept as well, because it still finds
     * links written into non-inline block fields this inventory does not
     * model. The two are merged for reachability checking; the COUNTS and the
     * anchor findings come only from the deliberate inventory, since the scan
     * cannot tell a real link from a path mentioned in prose and carries no
     * anchor text at all.
     */
    bodyLinksById.set(a.id, collectArticleLinks(a.blocks.map((b) => b.data)));
    for (const b of a.blocks) {
      const data = b.data as Record<string, unknown>;
      const text = typeof data?.text === 'string' ? data.text : '';
      if (b.blockType === 'heading' && text) headings.push(text);
      if (b.blockType === 'paragraph' && text) bodyWords += text.trim().split(/\s+/).filter(Boolean).length;
      blockStrings(b.data, strings);
      // sourceLink.url is rendered as a real <a href> (ArticleBody) — always checked, any scheme.
      if (b.blockType === 'sourceLink' && typeof data?.url === 'string' && data.url.trim()) hrefs.push(data.url.trim());
    }
    blockTextsById.set(a.id, strings);
    hrefsById.set(a.id, hrefs);
    return {
      id: a.id, slug: a.slug, title: a.title, excerpt: a.excerpt, status: a.workflowStatus,
      categoryId: a.categoryId, categoryName: a.category?.name ?? null, authorName: a.author?.name ?? null, createdById: a.createdById,
      heroImageUrl: a.heroImageUrl, publishedAt: a.publishedAt, robots: a.seo?.robots ?? 'index, follow',
      seoTitle: a.seo?.seoTitle ?? null, metaDescription: a.seo?.metaDescription ?? null, canonicalUrl: a.seo?.canonicalUrl ?? null, ogImage: a.seo?.ogImage ?? null,
      imageAltText: a.imageAltText, imageSeoTitle: a.imageSeoTitle,
      headings, bodyWords, internalLinks: [], // filled below once the route index exists
      bodyLinks: bodyLinksById.get(a.id) ?? [],
      linkCounts: { internalEditorial: 0, externalEditorial: 0, citations: 0, unrenderable: 0, distinctInternalTargets: 0 },
      hiddenFixture: isHiddenFixtureSlug(a.slug),
      disciplineSlugs: a.disciplines.map((d) => d.discipline.slug), hubIds: a.hubs.map((h) => h.hubId), eventIds: a.events.map((e) => e.eventId),
      editions: a.editions.map((e) => ({ id: e.edition.id, eventId: e.edition.eventId })),
      sourceCount: a._count.sources, relatedIds: relBySource.get(a.id) ?? [],
    };
  });

  const articleStatusBySlug = new Map<string, string>();
  for (const a of artInv) articleStatusBySlug.set(a.slug, a.status);

  const redirectSources = new Map<string, string>();
  for (const r of redirects) redirectSources.set(r.sourcePath, r.targetPath);

  // Batch S6 — route index from the S4 evaluation + the remaining valid public routes.
  const [sitemapEval, competitorSlugs] = await Promise.all([sitemapEvalP, competitorSlugsP]);
  const eventSlugById = new Map(events.map((e) => [e.id, e.slug]));
  const routes = buildRouteIndex({
    sitemap: sitemapEval,
    articles: artInv.map((a) => ({ slug: a.slug, status: a.status, hiddenFixture: a.hiddenFixture })),
    venueSlugs: venues.map((v) => v.slug),
    competitorSlugs: competitorSlugs.map((c) => c.slug),
    categorySlugs: categories.map((c) => c.slug),
    editions: editions.flatMap((e) => (eventSlugById.has(e.eventId) ? [{ eventSlug: eventSlugById.get(e.eventId)!, editionSlug: e.editionSlug }] : [])),
    redirects: redirectSources,
  });
  // Every route that renders a public page (kept for callers that read validPaths).
  const validPaths = new Set<string>([...routes].filter(([, r]) => RENDERS_PUBLICLY.has(r.status)).map(([p]) => p));
  const segments = routeFirstSegments(routes);
  for (const a of artInv) {
    const links = new Set<string>(hrefsById.get(a.id) ?? []);
    for (const s of blockTextsById.get(a.id) ?? []) for (const l of extractLinkCandidates(s, segments)) links.add(l);
    // Inline hrefs are added explicitly rather than relying on the scan to
    // have noticed them: a `mailto:` target, for one, is a real rendered link
    // that the scan's path and URL patterns do not match.
    for (const l of a.bodyLinks ?? []) if (l.renderable) links.add(l.href);
    a.internalLinks = [...links];
    a.linkCounts = countArticleLinks(a.bodyLinks ?? [], (href) => classifyLink(href, SITE_URL));
  }
  const sitemap = {
    urls: new Set(sitemapEval.included.map((c) => c.subject.path)),
    duplicates: sitemapEval.excluded.filter((x) => x.reason === 'duplicate-url').map((x) => ({ path: x.candidate.subject.path, family: x.candidate.family })),
  };
  const mediaByUrl = new Map<string, MediaInv>();
  for (const m of media) mediaByUrl.set(m.url, { id: m.id, url: m.url, visibility: m.visibility, rightsConfirmed: m.rightsConfirmed, storageProvider: m.storageProvider, altText: m.altText, seoTitle: m.seoTitle, width: m.width, height: m.height });

  return {
    articles: artInv, articleStatusBySlug, validPaths, redirectSources, routes, sitemap,
    hubs: hubs.map((h) => ({ id: h.id, slug: h.slug, title: h.title, articleCount: h._count.articles })),
    events: events.map((e) => ({ id: e.id, slug: e.slug, name: e.name, editionCount: e._count.editions })),
    editions: editions.map((e) => ({ id: e.id, slug: e.editionSlug, eventId: e.eventId, eventName: e.event.name, year: e.year, venueId: e.venueId, articleCount: e._count.articles })),
    disciplines, venues, categories,
    mediaByUrl, currentYear: new Date().getUTCFullYear(),
  };
}

export interface AuditResult { auditRunId: string; total: number; created: number; reopened: number; resolved: number; }

/** The logical scope string — the audit-run `scope` column and the lock identity. */
export function auditScopeKey(scope: AuditScope): string {
  return scope.kind + (scope.articleId ? `:${scope.articleId}` : '');
}

const auditError = (code: string, message: string) => Object.assign(new Error(message), { code });

/**
 * Run an audit under the S7 lock (lib/seo-intel/auditLock.ts).
 *
 * 1. Acquire the PostgreSQL advisory lock for the scope (fail closed: `unavailable` if the
 *    database cannot provide it; `conflict` if a live audit holds a conflicting lock).
 * 2. Recover abandoned runs: holding the lock proves no live audit of this scope exists, so
 *    its `running` rows (every scope's, for `full`) are marked failed/abandoned — atomically
 *    with respect to other recoverers, because they cannot hold the lock at the same time.
 *    Nothing is ever taken over because of elapsed time.
 * 3. Run; verify the lock at checkpoints; finish with an ownership-checked update.
 * 4. On error mark the run failed (only if still ours and running); always release.
 */
export async function runAudit(db: PrismaClient, scope: AuditScope, actorId: string): Promise<AuditResult> {
  const scopeKey = auditScopeKey(scope);
  let acq: AcquireResult;
  try {
    acq = await acquireAuditLock(db, scopeKey);
  } catch (e) {
    throw auditError(e instanceof AuditLockError ? e.code : 'unavailable', 'The SEO audit lock is temporarily unavailable; please retry.');
  }
  if (!acq.ok) throw auditError('conflict', 'An SEO audit is already running.');
  const lock = acq.handle;

  let runId: string | null = null;
  try {
    const recovered = await db.seoAuditRun.updateMany({
      where: { status: 'running', ...(scopeKey === FULL_SCOPE ? {} : { scope: scopeKey }) },
      data: { status: 'failed', completedAt: new Date(), summary: { reason: 'abandoned', detail: 'owner no longer held the audit lock', recoveredBy: lock.ownerId } as Prisma.InputJsonValue },
    });
    if (recovered.count) log.warn('seo.audit.recovered_abandoned_runs', { scopeKey, count: recovered.count, ownerId: lock.ownerId });

    await syncSeoRules(db);
    const run = await db.seoAuditRun.create({ data: { scope: scopeKey, engineVersion: SEO_ENGINE_VERSION, status: 'running', triggeredById: actorId, summary: { owner: lock.ownerId } as Prisma.InputJsonValue } });
    runId = run.id;
    return await executeAudit(db, scope, actorId, run.id, lock);
  } catch (e) {
    if (runId) {
      const reason = e instanceof AuditLockError && e.code === 'lock-lost' ? 'lock-lost' : 'error';
      // Only our own still-running row is changed (never another execution's).
      await db.seoAuditRun.updateMany({ where: { id: runId, status: 'running' }, data: { status: 'failed', completedAt: new Date(), summary: { owner: lock.ownerId, reason } as Prisma.InputJsonValue } })
        .catch((ce) => log.error('seo.audit.fail_mark_failed', { runId, error: ce instanceof Error ? ce.name : 'unknown' }));
    }
    throw e instanceof AuditLockError ? auditError(e.code, e.message) : e;
  } finally {
    const r = await lock.release();
    if (!r.released) log.warn('seo.audit.lock.release_after_loss', { scopeKey, ownerId: lock.ownerId, reason: r.lostReason });
  }
}

async function executeAudit(db: PrismaClient, scope: AuditScope, actorId: string, runId: string, lock: AuditLockHandle): Promise<AuditResult> {
  const run = { id: runId };
  {
    const thresholds = await getThresholds(db);
    const inv = await buildInventory(db);
    const raws = runAnalyzers(inv, thresholds, scope);
    const ruleRows = await db.seoRule.findMany({ select: { id: true, code: true, enabled: true } });
    const ruleIdByCode = new Map(ruleRows.map((r) => [r.code, r.id]));
    const disabled = new Set(ruleRows.filter((r) => !r.enabled).map((r) => r.code));

    let created = 0, reopened = 0;
    const seen = new Set<string>();
    const summary: Record<string, number> = {};
    await lock.assertHeld(); // checkpoint: before writing findings
    let written = 0;
    for (const raw of raws) {
      if (++written % 100 === 0) await lock.assertHeld(); // checkpoint during persistence
      const rule = RULE_BY_CODE[raw.ruleCode];
      const ruleId = ruleIdByCode.get(raw.ruleCode);
      if (!rule || !ruleId || disabled.has(raw.ruleCode)) continue; // disabled rules produce no findings

      const fp = fingerprint(raw);
      seen.add(fp);
      const severity = (raw.severity ?? rule.severity) as SeoSeverity;
      const kind = (raw.kind ?? rule.kind) as SeoFindingKind;
      summary[severity] = (summary[severity] ?? 0) + 1;
      const existing = await db.seoFinding.findUnique({ where: { fingerprint: fp }, select: { id: true, status: true } });
      const base = {
        ruleId, ruleCode: raw.ruleCode, ruleVersion: '1', auditRunId: run.id, articleId: raw.articleId ?? null,
        entityType: raw.entityType, entityId: raw.entityId ?? null, affectedUrl: raw.affectedUrl ?? null,
        severity, kind, category: rule.category, evidence: raw.evidence, recommendation: raw.recommendation ?? rule.recommendation,
        detail: (raw.detail ?? undefined) as Prisma.InputJsonValue | undefined, lastSeenAt: new Date(),
      };
      try {
        if (!existing) { await db.seoFinding.create({ data: { ...base, fingerprint: fp, status: 'OPEN' } }); created++; }
        else if (existing.status === 'RESOLVED') { await db.seoFinding.update({ where: { id: existing.id }, data: { ...base, status: 'REOPENED', resolvedAt: null, resolutionNote: null } }); reopened++; }
        else { await db.seoFinding.update({ where: { id: existing.id }, data: base }); } // OPEN/IN_PROGRESS/REOPENED/IGNORED keep status
      } catch {
        // Tolerate an entity (e.g. article) deleted mid-scan: drop this finding and
        // don't count it as "seen" so stale findings are still reconciled correctly.
        seen.delete(fp);
      }
    }

    await lock.assertHeld(); // checkpoint: before auto-resolve
    // Verified auto-resolve: active findings in this scope not seen this run.
    const scopeWhere: Prisma.SeoFindingWhereInput = { status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] }, fingerprint: { notIn: [...seen] } };
    if (scope.kind === 'article') scopeWhere.articleId = scope.articleId;
    else if (scope.kind === 'rodeo') scopeWhere.category = 'rodeo_entity';
    else if (scope.kind === 'technical') scopeWhere.category = { in: ['technical', 'structured_data'] };
    const toResolve = await db.seoFinding.findMany({ where: scopeWhere, select: { id: true } });
    if (toResolve.length) await db.seoFinding.updateMany({ where: { id: { in: toResolve.map((f) => f.id) } }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolutionNote: 'Auto-resolved: no longer detected by the SEO engine.' } });

    await lock.assertHeld(); // checkpoint: never record success without the lock
    // Ownership-checked completion: exactly our running row, or nothing.
    const done = await db.seoAuditRun.updateMany({ where: { id: run.id, status: 'running' }, data: { status: 'completed', completedAt: new Date(), totalFindings: seen.size, summary: summary as Prisma.InputJsonValue } });
    if (done.count !== 1) throw new AuditLockError('lock-lost', 'The audit run is no longer owned by this execution.');
    await db.auditLog.create({ data: { actorId, action: 'seo.audit.run', entityType: 'seo_audit', entityId: run.id, detail: `${scope.kind}: ${seen.size} findings (${created} new, ${reopened} reopened, ${toResolve.length} resolved)` } });
    return { auditRunId: run.id, total: seen.size, created, reopened, resolved: toResolve.length };
  }
}
