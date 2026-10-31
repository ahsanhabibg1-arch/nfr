import 'server-only';
import crypto from 'node:crypto';
import type { PrismaClient, Prisma, SeoSeverity, SeoFindingKind } from '@prisma/client';
import { PRIMARY_SECTIONS } from '../../config/routes';
import { RULES, RULE_BY_CODE, SEO_ENGINE_VERSION, DEFAULT_THRESHOLDS, Thresholds } from './rules';
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

const INTERNAL_PATH_RE = /\/(?:articles|competition|entertainment|events-shopping|plan-watch|rodeo-events|disciplines|categories)\/[a-z0-9][a-z0-9-/]*/gi;

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

  const artInv: ArticleInv[] = articles.map((a) => {
    const headings: string[] = [];
    let bodyWords = 0;
    const links = new Set<string>();
    for (const b of a.blocks) {
      const data = b.data as Record<string, unknown>;
      const text = typeof data?.text === 'string' ? data.text : '';
      if (b.blockType === 'heading' && text) headings.push(text);
      if (b.blockType === 'paragraph' && text) bodyWords += text.trim().split(/\s+/).filter(Boolean).length;
      const blob = JSON.stringify(b.data ?? {});
      for (const m of blob.matchAll(INTERNAL_PATH_RE)) links.add(m[0]);
    }
    return {
      id: a.id, slug: a.slug, title: a.title, excerpt: a.excerpt, status: a.workflowStatus,
      categoryId: a.categoryId, categoryName: a.category?.name ?? null, authorName: a.author?.name ?? null, createdById: a.createdById,
      heroImageUrl: a.heroImageUrl, publishedAt: a.publishedAt, robots: a.seo?.robots ?? 'index, follow',
      seoTitle: a.seo?.seoTitle ?? null, metaDescription: a.seo?.metaDescription ?? null, canonicalUrl: a.seo?.canonicalUrl ?? null, ogImage: a.seo?.ogImage ?? null,
      imageAltText: a.imageAltText, imageSeoTitle: a.imageSeoTitle,
      headings, bodyWords, internalLinks: [...links],
      disciplineSlugs: a.disciplines.map((d) => d.discipline.slug), hubIds: a.hubs.map((h) => h.hubId), eventIds: a.events.map((e) => e.eventId),
      editions: a.editions.map((e) => ({ id: e.edition.id, eventId: e.edition.eventId })),
      sourceCount: a._count.sources, relatedIds: relBySource.get(a.id) ?? [],
    };
  });

  const validPaths = new Set<string>(['/']);
  for (const key of Object.keys(PRIMARY_SECTIONS)) validPaths.add(PRIMARY_SECTIONS[key].path);
  for (const d of disciplines) validPaths.add(`/disciplines/${d.slug}/`);
  for (const c of categories) validPaths.add(`/categories/${c.slug}/`);
  const articleStatusBySlug = new Map<string, string>();
  for (const a of artInv) { articleStatusBySlug.set(a.slug, a.status); if (a.status === 'PUBLISHED') validPaths.add(`/articles/${a.slug}/`); }

  const redirectSources = new Map<string, string>();
  for (const r of redirects) redirectSources.set(r.sourcePath, r.targetPath);
  const mediaByUrl = new Map<string, MediaInv>();
  for (const m of media) mediaByUrl.set(m.url, { id: m.id, url: m.url, visibility: m.visibility, rightsConfirmed: m.rightsConfirmed, storageProvider: m.storageProvider, altText: m.altText, seoTitle: m.seoTitle, width: m.width, height: m.height });

  return {
    articles: artInv, articleStatusBySlug, validPaths, redirectSources,
    hubs: hubs.map((h) => ({ id: h.id, slug: h.slug, title: h.title, articleCount: h._count.articles })),
    events: events.map((e) => ({ id: e.id, slug: e.slug, name: e.name, editionCount: e._count.editions })),
    editions: editions.map((e) => ({ id: e.id, slug: e.editionSlug, eventId: e.eventId, eventName: e.event.name, year: e.year, venueId: e.venueId, articleCount: e._count.articles })),
    disciplines, venues, categories,
    mediaByUrl, currentYear: new Date().getUTCFullYear(),
  };
}

export interface AuditResult { auditRunId: string; total: number; created: number; reopened: number; resolved: number; }

export async function runAudit(db: PrismaClient, scope: AuditScope, actorId: string): Promise<AuditResult> {
  // Concurrent-run prevention (§17).
  const running = await db.seoAuditRun.findFirst({ where: { status: 'running' }, select: { id: true } });
  if (running) { const e = new Error('An SEO audit is already running.'); (e as { code?: string }).code = 'conflict'; throw e; }

  await syncSeoRules(db);
  const run = await db.seoAuditRun.create({ data: { scope: scope.kind + (scope.articleId ? `:${scope.articleId}` : ''), engineVersion: SEO_ENGINE_VERSION, status: 'running', triggeredById: actorId } });
  try {
    const thresholds = await getThresholds(db);
    const inv = await buildInventory(db);
    const raws = runAnalyzers(inv, thresholds, scope);
    const ruleRows = await db.seoRule.findMany({ select: { id: true, code: true, enabled: true } });
    const ruleIdByCode = new Map(ruleRows.map((r) => [r.code, r.id]));
    const disabled = new Set(ruleRows.filter((r) => !r.enabled).map((r) => r.code));

    let created = 0, reopened = 0;
    const seen = new Set<string>();
    const summary: Record<string, number> = {};
    for (const raw of raws) {
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

    // Verified auto-resolve: active findings in this scope not seen this run.
    const scopeWhere: Prisma.SeoFindingWhereInput = { status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] }, fingerprint: { notIn: [...seen] } };
    if (scope.kind === 'article') scopeWhere.articleId = scope.articleId;
    else if (scope.kind === 'rodeo') scopeWhere.category = 'rodeo_entity';
    else if (scope.kind === 'technical') scopeWhere.category = { in: ['technical', 'structured_data'] };
    const toResolve = await db.seoFinding.findMany({ where: scopeWhere, select: { id: true } });
    if (toResolve.length) await db.seoFinding.updateMany({ where: { id: { in: toResolve.map((f) => f.id) } }, data: { status: 'RESOLVED', resolvedAt: new Date(), resolutionNote: 'Auto-resolved: no longer detected by the SEO engine.' } });

    await db.seoAuditRun.update({ where: { id: run.id }, data: { status: 'completed', completedAt: new Date(), totalFindings: seen.size, summary: summary as Prisma.InputJsonValue } });
    await db.auditLog.create({ data: { actorId, action: 'seo.audit.run', entityType: 'seo_audit', entityId: run.id, detail: `${scope.kind}: ${seen.size} findings (${created} new, ${reopened} reopened, ${toResolve.length} resolved)` } });
    return { auditRunId: run.id, total: seen.size, created, reopened, resolved: toResolve.length };
  } catch (e) {
    await db.seoAuditRun.update({ where: { id: run.id }, data: { status: 'failed', completedAt: new Date() } }).catch(() => {});
    throw e;
  }
}
