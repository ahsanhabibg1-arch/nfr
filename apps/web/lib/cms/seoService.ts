import 'server-only';
import { z } from 'zod';
import type { Prisma, SeoSeverity, SeoFindingStatus } from '@prisma/client';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import { runAudit, syncSeoRules } from '../seo-intel/orchestrator';
import { AuditScope } from '../seo-intel/types';
import { RULES, DEFAULT_THRESHOLDS } from '../seo-intel/rules';

/**
 * SEO Intelligence service (Batch 06). Default-deny RBAC (seo.*) + audit. Audits
 * run bounded + synchronously (no worker). Findings are advisory — they never
 * block publishing (§19). Authors see findings for their OWN articles only.
 */
const need = (a: Actor, p: Parameters<typeof roleHasPermission>[1]) => { if (!roleHasPermission(a.roles, p)) throw new ServiceError('forbidden', `Not permitted (${p}).`); };
const canViewAll = (a: Actor) => roleHasPermission(a.roles, 'seo.finding.manage') || roleHasPermission(a.roles, 'seo.audit.run');

/** Author scope: restrict to findings on the actor's own articles. */
function viewScope(a: Actor): Prisma.SeoFindingWhereInput {
  if (canViewAll(a)) return {};
  return { article: { createdById: a.id } };
}

// ---------------- Audit ----------------
export async function runSeoAudit(actor: Actor, scope: AuditScope): Promise<Awaited<ReturnType<typeof runAudit>>> {
  need(actor, 'seo.audit.run');
  return runAudit(prisma, scope, actor.id);
}

// ---------------- Dashboard ----------------
export interface SeoDashboard {
  totalArticles: number; publishedArticles: number; analyzedUrls: number;
  latestRunAt: string | null; activeIssues: number;
  bySeverity: Record<string, number>; byCategory: Record<string, number>; byStatus: Record<string, number>;
  resolved: number; inProgress: number;
  recentRuns: { id: string; scope: string; startedAt: string; status: string; total: number }[];
  recentlyResolved: { id: string; ruleCode: string; evidence: string; affectedUrl: string | null; resolvedAt: string | null }[];
  scopedToOwn: boolean;
}

export async function getSeoDashboard(actor: Actor): Promise<SeoDashboard> {
  need(actor, 'seo.audit.view');
  const scope = viewScope(actor);
  const active: Prisma.SeoFindingWhereInput = { ...scope, status: { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] } };
  const [totalArticles, publishedArticles, latestRun, activeRows, resolved, inProgress, recentRuns, recentlyResolved] = await Promise.all([
    prisma.article.count(),
    prisma.article.count({ where: { workflowStatus: 'PUBLISHED' } }),
    prisma.seoAuditRun.findFirst({ orderBy: { startedAt: 'desc' }, select: { startedAt: true } }),
    prisma.seoFinding.findMany({ where: active, select: { severity: true, category: true, status: true } }),
    prisma.seoFinding.count({ where: { ...scope, status: 'RESOLVED' } }),
    prisma.seoFinding.count({ where: { ...scope, status: 'IN_PROGRESS' } }),
    prisma.seoAuditRun.findMany({ orderBy: { startedAt: 'desc' }, take: 5, select: { id: true, scope: true, startedAt: true, status: true, totalFindings: true } }),
    prisma.seoFinding.findMany({ where: { ...scope, status: 'RESOLVED' }, orderBy: { resolvedAt: 'desc' }, take: 6, select: { id: true, ruleCode: true, evidence: true, affectedUrl: true, resolvedAt: true } }),
  ]);
  const bySeverity: Record<string, number> = {}; const byCategory: Record<string, number> = {}; const byStatus: Record<string, number> = {};
  for (const f of activeRows) { bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1; byCategory[f.category] = (byCategory[f.category] ?? 0) + 1; byStatus[f.status] = (byStatus[f.status] ?? 0) + 1; }
  return {
    totalArticles, publishedArticles, analyzedUrls: publishedArticles, // public article URLs analyzed
    latestRunAt: latestRun?.startedAt.toISOString() ?? null, activeIssues: activeRows.length,
    bySeverity, byCategory, byStatus, resolved, inProgress,
    recentRuns: recentRuns.map((r) => ({ id: r.id, scope: r.scope, startedAt: r.startedAt.toISOString(), status: r.status, total: r.totalFindings })),
    recentlyResolved: recentlyResolved.map((f) => ({ id: f.id, ruleCode: f.ruleCode, evidence: f.evidence ?? '', affectedUrl: f.affectedUrl, resolvedAt: f.resolvedAt?.toISOString() ?? null })),
    scopedToOwn: !canViewAll(actor),
  };
}

// ---------------- Findings list ----------------
export interface FindingRow {
  id: string; ruleCode: string; title: string; category: string; kind: string; severity: string; status: string;
  evidence: string; recommendation: string | null; affectedUrl: string | null; entityType: string;
  assignedToId: string | null; lastSeenAt: string; firstSeenAt: string; resolutionNote: string | null;
}
export interface FindingListParams { status?: string; severity?: string; category?: string; kind?: string; q?: string; articleId?: string; page?: number; pageSize?: number; }
export interface FindingListResult { rows: FindingRow[]; total: number; page: number; pageSize: number; totalPages: number; }

const titleByCode = Object.fromEntries(RULES.map((r) => [r.code, r.title]));

export async function listFindings(actor: Actor, params: FindingListParams = {}): Promise<FindingListResult> {
  need(actor, 'seo.audit.view');
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, params.pageSize ?? 25));
  const where: Prisma.SeoFindingWhereInput = { ...viewScope(actor) };
  if (params.status && ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'IGNORED', 'REOPENED'].includes(params.status)) where.status = params.status as SeoFindingStatus;
  else where.status = { in: ['OPEN', 'IN_PROGRESS', 'REOPENED'] }; // default: active
  if (params.severity) where.severity = params.severity as SeoSeverity;
  if (params.category) where.category = params.category;
  if (params.kind) where.kind = params.kind as never;
  if (params.articleId) where.articleId = params.articleId;
  if (params.q) where.OR = [{ evidence: { contains: params.q, mode: 'insensitive' } }, { affectedUrl: { contains: params.q, mode: 'insensitive' } }, { ruleCode: { contains: params.q, mode: 'insensitive' } }];
  const [rows, total] = await Promise.all([
    prisma.seoFinding.findMany({ where, orderBy: [{ severity: 'asc' }, { lastSeenAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.seoFinding.count({ where }),
  ]);
  return {
    rows: rows.map((f) => ({ id: f.id, ruleCode: f.ruleCode, title: titleByCode[f.ruleCode] ?? f.ruleCode, category: f.category, kind: f.kind, severity: f.severity, status: f.status, evidence: f.evidence ?? '', recommendation: f.recommendation, affectedUrl: f.affectedUrl, entityType: f.entityType, assignedToId: f.assignedToId, lastSeenAt: f.lastSeenAt.toISOString(), firstSeenAt: f.firstSeenAt.toISOString(), resolutionNote: f.resolutionNote })),
    total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// ---------------- Finding workflow ----------------
const FindingPatch = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'IGNORED', 'REOPENED']).optional(),
  assignedToId: z.string().max(64).nullable().optional(),
  resolutionNote: z.string().max(1000).optional(),
});
export type FindingPatchInput = z.input<typeof FindingPatch>;

export async function updateFinding(actor: Actor, id: string, raw: FindingPatchInput): Promise<void> {
  need(actor, 'seo.finding.manage');
  const v = FindingPatch.parse(raw);
  const existing = await prisma.seoFinding.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ServiceError('not_found', 'Finding not found');
  const data: Prisma.SeoFindingUpdateInput = {};
  if (v.assignedToId !== undefined) data.assignedToId = v.assignedToId;
  if (v.resolutionNote !== undefined) data.resolutionNote = v.resolutionNote;
  if (v.status) {
    data.status = v.status;
    // Manual status is distinct from verified technical resolution. Mark who/when
    // but keep it as a manually-recorded state (a re-audit still reconciles reality).
    if (v.status === 'RESOLVED') { data.resolvedById = actor.id; data.resolvedAt = new Date(); }
    else if (v.status === 'OPEN' || v.status === 'REOPENED') { data.resolvedById = null; data.resolvedAt = null; }
  }
  await prisma.seoFinding.update({ where: { id }, data });
  await audit(actor.id, 'seo.finding.update', 'seo_finding', id, v.status ?? 'edit');
}

/** Re-run the audit for a finding's scope to get a VERIFIED current status (§14). */
export async function recheckFinding(actor: Actor, id: string): Promise<{ status: string }> {
  need(actor, 'seo.audit.run');
  const f = await prisma.seoFinding.findUnique({ where: { id }, select: { articleId: true } });
  if (!f) throw new ServiceError('not_found', 'Finding not found');
  await runAudit(prisma, f.articleId ? { kind: 'article', articleId: f.articleId } : { kind: 'full' }, actor.id);
  const after = await prisma.seoFinding.findUnique({ where: { id }, select: { status: true } });
  return { status: after?.status ?? 'RESOLVED' };
}

// ---------------- Rules & config (§15) ----------------
export async function listSeoRules(actor: Actor) {
  need(actor, 'seo.audit.view');
  await syncSeoRules(prisma);
  return prisma.seoRule.findMany({ orderBy: [{ category: 'asc' }, { code: 'asc' }], select: { code: true, title: true, category: true, severity: true, enabled: true, description: true } });
}

export async function setRuleEnabled(actor: Actor, code: string, enabled: boolean): Promise<void> {
  need(actor, 'seo.config');
  if (!(await prisma.seoRule.findUnique({ where: { code }, select: { code: true } }))) throw new ServiceError('not_found', 'Rule not found');
  await prisma.seoRule.update({ where: { code }, data: { enabled } });
  await audit(actor.id, 'seo.rule.toggle', 'seo_rule', code, enabled ? 'enabled' : 'disabled');
}

const ThresholdsInput = z.object({
  seoTitleMin: z.number().int().min(5).max(100), seoTitleMax: z.number().int().min(10).max(200),
  metaDescMin: z.number().int().min(20).max(200), metaDescMax: z.number().int().min(50).max(400),
  minBodyWords: z.number().int().min(10).max(2000),
}).refine((v) => v.seoTitleMax > v.seoTitleMin && v.metaDescMax > v.metaDescMin, { message: 'max must exceed min' });
export type ThresholdsInput = z.input<typeof ThresholdsInput>;

export async function getSeoThresholds(actor: Actor): Promise<typeof DEFAULT_THRESHOLDS> {
  need(actor, 'seo.audit.view');
  const row = await prisma.seoConfig.findUnique({ where: { key: 'thresholds' } });
  return { ...DEFAULT_THRESHOLDS, ...((row?.value as Partial<typeof DEFAULT_THRESHOLDS>) ?? {}) };
}

export async function updateSeoThresholds(actor: Actor, raw: ThresholdsInput): Promise<void> {
  need(actor, 'seo.config');
  const v = ThresholdsInput.parse(raw);
  await prisma.seoConfig.upsert({ where: { key: 'thresholds' }, update: { value: v, updatedById: actor.id }, create: { key: 'thresholds', value: v, updatedById: actor.id } });
  await audit(actor.id, 'seo.config.thresholds', 'seo_config', 'thresholds');
}

export async function getFindingDetail(actor: Actor, id: string) {
  need(actor, 'seo.audit.view');
  const f = await prisma.seoFinding.findFirst({ where: { id, ...viewScope(actor) } });
  if (!f) throw new ServiceError('not_found', 'Finding not found');
  return f;
}
