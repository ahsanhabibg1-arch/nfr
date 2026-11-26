import 'server-only';
import { createHash } from 'node:crypto';
import type { Prisma, RedirectOrigin, RedirectStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { Actor } from './guard';
import { roleHasPermission, type Permission } from '@/lib/auth/rbac';
import {
  isPermanentStatus,
  isReservedPath,
  isSupportedRedirectStatus,
  normalizeRedirectPath,
  validateRedirectDestinationShape,
  validateRedirectSource,
  type RedirectStatusCode,
} from '@/lib/redirects/paths';
import { resolveLiveCanonical } from '@/lib/redirects/resolve';
import { invalidateRedirectCache, lockRedirectGraph } from '@/lib/redirects/write';

export class RedirectAdminError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message); }
}

const PAGE_MAX = 100;
const BULK_MAX = 100;
const IMPORT_MAX_ROWS = 500;
const IMPORT_MAX_BYTES = 256 * 1024;
const DIAGNOSTIC_MAX = 500;
const NOTE_MAX = 1_000;

function need(actor: Actor, permission: Permission): void {
  if (!roleHasPermission(actor.roles, permission)) throw new RedirectAdminError('forbidden', `Not permitted (${permission}).`);
}

export interface RedirectFilters {
  q?: string;
  statusCode?: number;
  status?: RedirectStatus;
  origin?: RedirectOrigin;
  page?: number;
  pageSize?: number;
  sort?: 'updated-desc' | 'updated-asc' | 'source-asc';
}

export async function listRedirects(actor: Actor, filters: RedirectFilters = {}) {
  need(actor, 'redirect.view');
  const requestedPage = typeof filters.page === 'number' && Number.isSafeInteger(filters.page) && filters.page > 0 ? filters.page : 1;
  const requestedPageSize = typeof filters.pageSize === 'number' && Number.isSafeInteger(filters.pageSize) && filters.pageSize > 0 ? filters.pageSize : 25;
  const pageSize = Math.min(PAGE_MAX, requestedPageSize);
  const query = typeof filters.q === 'string' ? filters.q.trim() : '';
  if (query.length > 200) throw new RedirectAdminError('query_too_long', 'Search text must be 200 characters or fewer.');
  const status = filters.status === 'ACTIVE' || filters.status === 'DISABLED' ? filters.status : undefined;
  const origin = filters.origin === 'AUTOMATIC' || filters.origin === 'MANUAL' || filters.origin === 'LEGACY' ? filters.origin : undefined;
  const where: Prisma.ArticleRedirectWhereInput = {};
  if (query) where.OR = [
    { sourcePath: { contains: query, mode: 'insensitive' } },
    { targetPath: { contains: query, mode: 'insensitive' } },
  ];
  if (filters.statusCode && isSupportedRedirectStatus(filters.statusCode)) where.statusCode = filters.statusCode;
  if (status) where.status = status;
  if (origin) where.origin = origin;
  const orderBy: Prisma.ArticleRedirectOrderByWithRelationInput = filters.sort === 'source-asc'
    ? { sourcePath: 'asc' }
    : { updatedAt: filters.sort === 'updated-asc' ? 'asc' : 'desc' };
  const [total, groupedStatus, groupedOrigin] = await Promise.all([
    prisma.articleRedirect.count({ where }),
    prisma.articleRedirect.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.articleRedirect.groupBy({ by: ['origin'], _count: { _all: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pages);
  const rows = await prisma.articleRedirect.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize });
  const statusCounts = Object.fromEntries(groupedStatus.map((x) => [x.status, x._count._all]));
  const originCounts = Object.fromEntries(groupedOrigin.map((x) => [x.origin, x._count._all]));
  return {
    rows,
    page,
    pageSize,
    total,
    pages,
    summary: {
      total: Object.values(statusCounts).reduce((n, x) => n + Number(x), 0),
      active: statusCounts.ACTIVE || 0,
      disabled: statusCounts.DISABLED || 0,
      automatic: originCounts.AUTOMATIC || 0,
      manual: originCounts.MANUAL || 0,
      legacy: originCounts.LEGACY || 0,
    },
  };
}

export async function getRedirect(actor: Actor, id: string) {
  need(actor, 'redirect.view');
  const row = await prisma.articleRedirect.findUnique({
    where: { id },
    include: { createdBy: { select: { name: true } }, updatedBy: { select: { name: true } } },
  });
  if (!row) throw new RedirectAdminError('not_found', 'Redirect not found.');
  return row;
}

export interface RedirectRuleInput {
  sourcePath: string;
  targetPath: string;
  statusCode: number;
  status?: RedirectStatus;
  note?: string | null;
}

async function validateRule(input: RedirectRuleInput, excludeId?: string) {
  const source = validateRedirectSource(input.sourcePath);
  if (!source.ok || !source.path) throw new RedirectAdminError('invalid_source', `Invalid source path (${source.reason}).`);
  const target = validateRedirectDestinationShape(input.targetPath, source.path);
  if (!target.ok || !target.path) throw new RedirectAdminError('invalid_target', `Invalid destination path (${target.reason}).`);
  if (!isSupportedRedirectStatus(input.statusCode)) throw new RedirectAdminError('bad_status', 'Status must be 301, 302, 307 or 308.');
  if ((input.note || '').length > NOTE_MAX) throw new RedirectAdminError('note_too_long', `Note must be ${NOTE_MAX} characters or fewer.`);
  const [canonicalSource, canonicalTarget, duplicate, activeRows] = await Promise.all([
    resolveLiveCanonical(source.path),
    resolveLiveCanonical(target.path),
    prisma.articleRedirect.findUnique({ where: { sourcePath: source.path }, select: { id: true } }),
    prisma.articleRedirect.findMany({ where: { status: 'ACTIVE', ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { sourcePath: true, targetPath: true }, take: DIAGNOSTIC_MAX + 1 }),
  ]);
  if (canonicalSource) throw new RedirectAdminError('canonical_conflict', 'The source is a live canonical page and cannot be shadowed.');
  if (!canonicalTarget) throw new RedirectAdminError('target_not_live', 'The destination is not a live public page.');
  if (duplicate && duplicate.id !== excludeId) throw new RedirectAdminError('duplicate_source', 'A redirect already owns this source path.');
  if (activeRows.length > DIAGNOSTIC_MAX) throw new RedirectAdminError('graph_too_large', 'Redirect graph exceeds the safe validation bound.');
  const graph = new Map(activeRows.map((r) => [r.sourcePath, r.targetPath]));
  graph.set(source.path, canonicalTarget);
  let cursor = canonicalTarget;
  const seen = new Set([source.path]);
  for (let depth = 0; depth <= DIAGNOSTIC_MAX; depth++) {
    if (seen.has(cursor)) throw new RedirectAdminError('cycle', 'This rule would create a redirect cycle.');
    seen.add(cursor);
    const next = graph.get(cursor);
    if (!next) break;
    cursor = next;
  }
  return { sourcePath: source.path, targetPath: canonicalTarget, statusCode: input.statusCode as RedirectStatusCode, status: input.status || 'ACTIVE', note: input.note?.trim() || null };
}

export async function validateRedirect(actor: Actor, input: RedirectRuleInput, excludeId?: string) {
  need(actor, 'redirect.manage');
  return validateRule(input, excludeId);
}

export async function createRedirect(actor: Actor, input: RedirectRuleInput) {
  need(actor, 'redirect.manage');
  const row = await prisma.$transaction(async (tx) => {
    await lockRedirectGraph(tx);
    const rule = await validateRule(input);
    const created = await tx.articleRedirect.create({ data: { ...rule, origin: 'MANUAL', createdById: actor.id, updatedById: actor.id } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: 'redirect.create', entityType: 'redirect', entityId: created.id, detail: JSON.stringify({ after: rule }) } });
    return created;
  });
  await invalidateRedirectCache();
  return row;
}

export async function updateRedirect(actor: Actor, id: string, input: RedirectRuleInput) {
  need(actor, 'redirect.manage');
  const row = await prisma.$transaction(async (tx) => {
    await lockRedirectGraph(tx);
    const before = await tx.articleRedirect.findUnique({ where: { id } });
    if (!before) throw new RedirectAdminError('not_found', 'Redirect not found.');
    const rule = await validateRule(input, id);
    const updated = await tx.articleRedirect.update({ where: { id }, data: { ...rule, updatedById: actor.id } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: 'redirect.edit', entityType: 'redirect', entityId: id, detail: JSON.stringify({ before, after: rule }) } });
    return updated;
  });
  await invalidateRedirectCache();
  return row;
}

export async function setRedirectStatus(actor: Actor, id: string, status: RedirectStatus) {
  need(actor, 'redirect.manage');
  const row = await prisma.$transaction(async (tx) => {
    await lockRedirectGraph(tx);
    const before = await tx.articleRedirect.findUnique({ where: { id } });
    if (!before) throw new RedirectAdminError('not_found', 'Redirect not found.');
    if (status === 'ACTIVE') await validateRule({ ...before, status: 'ACTIVE' }, id);
    const updated = await tx.articleRedirect.update({ where: { id }, data: { status, updatedById: actor.id } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: status === 'ACTIVE' ? 'redirect.activate' : 'redirect.deactivate', entityType: 'redirect', entityId: id, detail: JSON.stringify({ from: before.status, to: status }) } });
    return updated;
  });
  await invalidateRedirectCache();
  return row;
}

export async function deleteRedirect(actor: Actor, id: string) {
  need(actor, 'redirect.delete');
  const sourcePath = await prisma.$transaction(async (tx) => {
    await lockRedirectGraph(tx);
    const before = await tx.articleRedirect.findUnique({ where: { id } });
    if (!before) throw new RedirectAdminError('not_found', 'Redirect not found.');
    if (before.status === 'ACTIVE') throw new RedirectAdminError('active_delete', 'Deactivate this redirect before deleting it.');
    const dependent = await tx.articleRedirect.count({ where: { status: 'ACTIVE', targetPath: before.sourcePath } });
    if (dependent) throw new RedirectAdminError('dependent_redirects', 'Active redirects still depend on this source path.');
    await tx.articleRedirect.delete({ where: { id } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: 'redirect.delete', entityType: 'redirect', entityId: id, detail: JSON.stringify({ before }) } });
    return before.sourcePath;
  });
  await invalidateRedirectCache();
  return { sourcePath };
}

function boundedIds(ids: string[]): string[] {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length || unique.length > BULK_MAX) throw new RedirectAdminError('bad_batch', `Select 1-${BULK_MAX} redirects.`);
  return unique;
}

export async function bulkSetStatus(actor: Actor, ids: string[], status: RedirectStatus) {
  need(actor, 'redirect.manage');
  const selected = boundedIds(ids);
  const rows = await prisma.$transaction(async (tx) => {
    await lockRedirectGraph(tx);
    const current = await tx.articleRedirect.findMany({ where: { id: { in: selected } } });
    if (current.length !== selected.length) throw new RedirectAdminError('not_found', 'One or more redirects no longer exist.');
    if (status === 'ACTIVE') for (const row of current) await validateRule({ ...row, status }, row.id);
    await tx.articleRedirect.updateMany({ where: { id: { in: selected } }, data: { status, updatedById: actor.id } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: `redirect.bulk.${status.toLowerCase()}`, entityType: 'redirect', detail: JSON.stringify({ ids: selected }) } });
    return current;
  });
  await invalidateRedirectCache();
  return { count: selected.length, sourcePaths: rows.map((row) => row.sourcePath) };
}

export async function bulkDelete(actor: Actor, ids: string[]) {
  need(actor, 'redirect.delete');
  const selected = boundedIds(ids);
  const rows = await prisma.$transaction(async (tx) => {
    await lockRedirectGraph(tx);
    const current = await tx.articleRedirect.findMany({ where: { id: { in: selected } } });
    if (current.length !== selected.length || current.some((r) => r.status === 'ACTIVE')) {
      throw new RedirectAdminError('unsafe_delete', 'Every selected redirect must exist and be disabled.');
    }
    const dependencies = await tx.articleRedirect.count({ where: { status: 'ACTIVE', targetPath: { in: current.map((r) => r.sourcePath) } } });
    if (dependencies) throw new RedirectAdminError('dependent_redirects', 'Selected redirects have active dependants.');
    await tx.articleRedirect.deleteMany({ where: { id: { in: selected } } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: 'redirect.bulk.delete', entityType: 'redirect', detail: JSON.stringify({ rows: current }) } });
    return current;
  });
  await invalidateRedirectCache();
  return { count: selected.length, sourcePaths: rows.map((row) => row.sourcePath) };
}

const csvCell = (value: unknown) => {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
};

export async function exportRedirects(actor: Actor, filters: RedirectFilters = {}, ids?: string[]) {
  need(actor, 'redirect.export');
  const where: Prisma.ArticleRedirectWhereInput = ids?.length ? { id: { in: boundedIds(ids) } } : {};
  const query = typeof filters.q === 'string' ? filters.q.trim() : '';
  if (!ids?.length && query.length > 200) throw new RedirectAdminError('query_too_long', 'Search text must be 200 characters or fewer.');
  if (!ids?.length && query) where.OR = [{ sourcePath: { contains: query, mode: 'insensitive' } }, { targetPath: { contains: query, mode: 'insensitive' } }];
  const status = filters.status === 'ACTIVE' || filters.status === 'DISABLED' ? filters.status : undefined;
  const origin = filters.origin === 'AUTOMATIC' || filters.origin === 'MANUAL' || filters.origin === 'LEGACY' ? filters.origin : undefined;
  if (!ids?.length && status) where.status = status;
  if (!ids?.length && origin) where.origin = origin;
  if (!ids?.length && filters.statusCode && isSupportedRedirectStatus(filters.statusCode)) where.statusCode = filters.statusCode;
  const count = await prisma.articleRedirect.count({ where });
  if (count > 5_000) throw new RedirectAdminError('export_too_large', 'Export is limited to 5,000 redirects; narrow the filters and try again.');
  const rows = await prisma.articleRedirect.findMany({ where, orderBy: { sourcePath: 'asc' }, take: 5_000 });
  const header = ['sourcePath', 'targetPath', 'statusCode', 'status', 'origin', 'note', 'createdAt', 'updatedAt'];
  return [header.map(csvCell).join(','), ...rows.map((r) => header.map((key) => csvCell(r[key as keyof typeof r])).join(','))].join('\r\n');
}

function parseCsv(text: string): string[][] {
  if (Buffer.byteLength(text, 'utf8') > IMPORT_MAX_BYTES) throw new RedirectAdminError('file_too_large', `CSV must be at most ${IMPORT_MAX_BYTES} bytes.`);
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted && c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (!quoted && c === ',') { row.push(cell); cell = ''; }
    else if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  if (quoted) throw new RedirectAdminError('invalid_csv', 'CSV contains an unterminated quoted field.');
  row.push(cell); if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

export interface CsvDryRunRow { row: number; input: RedirectRuleInput; normalized?: Awaited<ReturnType<typeof validateRule>>; error?: string }

export async function dryRunCsvImport(actor: Actor, text: string) {
  need(actor, 'redirect.import');
  const parsed = parseCsv(text);
  if (!parsed.length) throw new RedirectAdminError('empty_csv', 'CSV is empty.');
  const expected = ['sourcePath', 'targetPath', 'statusCode', 'status', 'note'];
  const headers = parsed[0].map((x) => x.trim());
  if (expected.some((h) => !headers.includes(h))) throw new RedirectAdminError('invalid_headers', `Required headers: ${expected.join(', ')}.`);
  if (parsed.length - 1 > IMPORT_MAX_ROWS) throw new RedirectAdminError('too_many_rows', `CSV may contain at most ${IMPORT_MAX_ROWS} data rows.`);
  const seen = new Set<string>();
  const results: CsvDryRunRow[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const value = (name: string) => parsed[i][headers.indexOf(name)] || '';
    const input: RedirectRuleInput = {
      sourcePath: value('sourcePath'), targetPath: value('targetPath'), statusCode: Number(value('statusCode')),
      status: value('status') === 'DISABLED' ? 'DISABLED' : 'ACTIVE', note: value('note') || null,
    };
    try {
      const normalizedSource = normalizeRedirectPath(input.sourcePath);
      if (normalizedSource && seen.has(normalizedSource)) throw new RedirectAdminError('duplicate_import', 'Duplicate source within CSV.');
      if (normalizedSource) seen.add(normalizedSource);
      results.push({ row: i + 1, input, normalized: await validateRule(input) });
    } catch (e) { results.push({ row: i + 1, input, error: (e as Error).message }); }
  }
  const state = await prisma.articleRedirect.aggregate({ _count: { _all: true }, _max: { updatedAt: true } });
  const token = createHash('sha256').update(JSON.stringify({ text, state })).digest('hex');
  return { rows: results, valid: results.filter((r) => !r.error).length, invalid: results.filter((r) => !!r.error).length, token };
}

export async function confirmCsvImport(actor: Actor, text: string, token: string) {
  need(actor, 'redirect.import');
  const dry = await dryRunCsvImport(actor, text);
  if (dry.token !== token) throw new RedirectAdminError('stale_dry_run', 'Redirect data changed; run the CSV dry run again.');
  if (dry.invalid || !dry.valid) throw new RedirectAdminError('invalid_import', 'Import contains invalid rows.');
  const normalized = dry.rows.map((r) => r.normalized!);
  await prisma.$transaction(async (tx) => {
    await lockRedirectGraph(tx);
    for (const candidate of dry.rows) {
      const rule = await validateRule(candidate.input);
      await tx.articleRedirect.create({ data: { ...rule, origin: 'MANUAL', createdById: actor.id, updatedById: actor.id } });
    }
    await tx.auditLog.create({ data: { actorId: actor.id, action: 'redirect.csv.import', entityType: 'redirect', detail: JSON.stringify({ count: normalized.length }) } });
  });
  await invalidateRedirectCache();
  return { count: normalized.length, sourcePaths: normalized.map((row) => row.sourcePath) };
}

export const SAMPLE_REDIRECT_CSV = 'sourcePath,targetPath,statusCode,status,note\r\n/old-example/,/articles/live-example/,301,DISABLED,Review before activation\r\n';

export interface DiagnosticIssue { redirectId: string; severity: 'error' | 'warning' | 'info'; code: string; sourcePath: string; targetPath: string; message: string }

export async function getDiagnostics(actor: Actor, page = 1, pageSize = 50) {
  need(actor, 'redirect.diagnostics');
  const [rows, totalRedirects] = await Promise.all([
    prisma.articleRedirect.findMany({
      orderBy: { sourcePath: 'asc' },
      take: DIAGNOSTIC_MAX,
      select: { id: true, sourcePath: true, targetPath: true, statusCode: true, status: true },
    }),
    prisma.articleRedirect.count(),
  ]);
  const active = new Map(rows.filter((r) => r.status === 'ACTIVE').map((r) => [r.sourcePath, r]));
  const issues: DiagnosticIssue[] = [];
  for (const row of rows) {
    const add = (severity: DiagnosticIssue['severity'], code: string, message: string) => issues.push({ redirectId: row.id, severity, code, sourcePath: row.sourcePath, targetPath: row.targetPath, message });
    if (row.status === 'DISABLED') add('info', 'disabled_history', 'Disabled historical rule; it is not served.');
    if (!normalizeRedirectPath(row.sourcePath) || isReservedPath(row.sourcePath)) add('error', 'invalid_source', 'Source is malformed or reserved.');
    if (!normalizeRedirectPath(row.targetPath) || isReservedPath(row.targetPath)) add('error', 'invalid_target', 'Destination is malformed, external or reserved.');
    if (normalizeRedirectPath(row.sourcePath) === normalizeRedirectPath(row.targetPath)) add('error', 'self_redirect', 'Source and destination are the same.');
    if (!isSupportedRedirectStatus(row.statusCode)) add('error', 'unsupported_status', 'Stored HTTP status is unsupported.');
    if (row.status === 'ACTIVE') {
      if (await resolveLiveCanonical(row.sourcePath)) add('error', 'canonical_shadow', 'Source is currently a live canonical page.');
      if (!(await resolveLiveCanonical(row.targetPath))) add('error', 'dangling_target', 'Destination is not currently public.');
      const targetRule = active.get(row.targetPath);
      if (targetRule && isPermanentStatus(row.statusCode) && isPermanentStatus(targetRule.statusCode)) add('warning', 'permanent_chain', 'Permanent redirect has another redirect as its destination.');
      if (targetRule && !isPermanentStatus(row.statusCode)) add('warning', 'temporary_chain', 'Temporary redirect enters another redirect and should be reviewed.');
      let cursor = row.targetPath; const seen = new Set([row.sourcePath]);
      for (let depth = 0; depth <= rows.length; depth++) {
        if (seen.has(cursor)) { add('error', 'cycle', 'Redirect participates in a circular graph.'); break; }
        seen.add(cursor); const next = active.get(cursor); if (!next) break; cursor = next.targetPath;
      }
    }
  }
  const requestedPageSize = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : 50;
  const safePageSize = Math.min(100, requestedPageSize);
  const pages = Math.max(1, Math.ceil(issues.length / safePageSize));
  const safePage = Math.min(pages, Number.isSafeInteger(page) && page > 0 ? page : 1);
  return {
    total: issues.length,
    page: safePage,
    pageSize: safePageSize,
    pages,
    scanned: rows.length,
    truncated: totalRedirects > rows.length,
    rows: issues.slice((safePage - 1) * safePageSize, safePage * safePageSize),
  };
}

export async function getRedirectAudit(actor: Actor, redirectId?: string) {
  need(actor, 'redirect.view');
  return prisma.auditLog.findMany({ where: { entityType: 'redirect', ...(redirectId ? { entityId: redirectId } : {}) }, orderBy: { createdAt: 'desc' }, take: 100, include: { actor: { select: { name: true } } } });
}
