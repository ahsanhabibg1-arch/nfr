import 'server-only';
import { z } from 'zod';
import type { AnalyticsEntityType, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { PRIMARY_SECTIONS } from '../../config/routes';
import { getAnalyticsSettings, searchLoggingActive, contentViewActive } from './config';
import { normalizeQuery, redactForStorage } from './privacy';
import { isDuplicate } from './rateLimit';

/**
 * Public, privacy-conscious event ingest (Batch 07 §6/§7). No RBAC (public), no
 * identifiers stored. Every recorder:
 *   1. honors the owner collection switch (disabled → silently not recorded),
 *   2. validates the payload and that the referenced entity is a REAL, publicly
 *      accessible entity (rejects client-supplied false page identity, §7),
 *   3. drops rapid duplicates using a transient, non-persisted client key,
 *   4. writes a minimal raw event AND increments the durable daily aggregate.
 */

export type IngestReason = 'disabled' | 'invalid' | 'duplicate';
export interface IngestResult {
  recorded: boolean;
  reason?: IngestReason;
}

export interface IngestContext {
  /** Transient hash of request signal (IP+UA), used only for dedup. NEVER stored. */
  clientKey: string;
}

const DEDUP_WINDOW_MS = 30_000;

// ---- metric names for AnalyticsDailyAggregate ----
const M_VIEW = 'content_view';
const M_SEARCH = 'search_query';
const M_ZERO = 'search_zero_result';
const M_CLICK = 'search_click';

function utcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function bumpAggregate(
  tx: Prisma.TransactionClient,
  metric: string,
  entityType = '',
  entityId = '',
  by = 1,
): Promise<void> {
  const day = utcDay();
  await tx.analyticsDailyAggregate.upsert({
    where: { day_metric_entityType_entityId: { day, metric, entityType, entityId } },
    create: { day, metric, entityType, entityId, count: by },
    update: { count: { increment: by } },
  });
}

/** Verify an entity exists and is publicly accessible. Returns false for unknown ids
 * and for entity kinds that have no public page yet (rodeo hub/event/edition). */
async function entityIsPublic(entityType: AnalyticsEntityType, entityId: string): Promise<boolean> {
  switch (entityType) {
    case 'ARTICLE': {
      const a = await prisma.article.findFirst({ where: { id: entityId, workflowStatus: 'PUBLISHED' }, select: { id: true } });
      return !!a;
    }
    case 'DISCIPLINE': {
      const d = await prisma.discipline.findUnique({ where: { id: entityId }, select: { id: true } });
      return !!d;
    }
    case 'CATEGORY': {
      const c = await prisma.category.findUnique({ where: { id: entityId }, select: { id: true } });
      return !!c;
    }
    case 'SECTION':
      return Object.prototype.hasOwnProperty.call(PRIMARY_SECTIONS, entityId);
    default:
      return false; // RODEO_* — no public detail route yet
  }
}

const entityEnum = z.enum(['ARTICLE', 'DISCIPLINE', 'CATEGORY', 'SECTION', 'RODEO_HUB', 'RODEO_EVENT', 'RODEO_EDITION']);

// ---- Content view ----
const ContentViewInput = z.object({
  entityType: entityEnum,
  entityId: z.string().min(1).max(64),
  path: z.string().min(1).max(512),
});
export type ContentViewInput = z.input<typeof ContentViewInput>;

export async function recordContentView(ctx: IngestContext, raw: unknown): Promise<IngestResult> {
  const settings = await getAnalyticsSettings();
  if (!contentViewActive(settings)) return { recorded: false, reason: 'disabled' };
  const parsed = ContentViewInput.safeParse(raw);
  if (!parsed.success) return { recorded: false, reason: 'invalid' };
  const { entityType, entityId, path } = parsed.data;
  if (!(await entityIsPublic(entityType, entityId))) return { recorded: false, reason: 'invalid' };
  if (isDuplicate(`${ctx.clientKey}:view:${entityType}:${entityId}`, DEDUP_WINDOW_MS)) return { recorded: false, reason: 'duplicate' };
  await prisma.$transaction(async (tx) => {
    await tx.contentViewEvent.create({ data: { entityType, entityId, path: path.slice(0, 512) } });
    await bumpAggregate(tx, M_VIEW, entityType, entityId);
  });
  return { recorded: true };
}

// ---- Search submitted ----
const SearchQueryInput = z.object({
  query: z.string().max(400),
  resultCount: z.number().int().min(0).max(100000),
  zeroResult: z.boolean(),
  contentType: z.string().max(32).optional(),
});
export type SearchQueryInput = z.input<typeof SearchQueryInput>;

export async function recordSearchQuery(ctx: IngestContext, raw: unknown): Promise<IngestResult> {
  const settings = await getAnalyticsSettings();
  if (!searchLoggingActive(settings)) return { recorded: false, reason: 'disabled' };
  const parsed = SearchQueryInput.safeParse(raw);
  if (!parsed.success) return { recorded: false, reason: 'invalid' };
  const { query, resultCount, zeroResult, contentType } = parsed.data;
  const { text, originalLength } = normalizeQuery(query);
  if (!text) return { recorded: false, reason: 'invalid' };
  const stored = settings.redactQueries ? redactForStorage(text) : text;
  if (!stored) return { recorded: false, reason: 'invalid' };
  if (isDuplicate(`${ctx.clientKey}:search:${stored}:${contentType ?? ''}`, DEDUP_WINDOW_MS)) return { recorded: false, reason: 'duplicate' };
  await prisma.$transaction(async (tx) => {
    await tx.searchQueryEvent.create({
      data: { normalizedQuery: stored, queryLength: originalLength, resultCount, zeroResult, contentType: contentType ?? null },
    });
    await bumpAggregate(tx, M_SEARCH);
    if (zeroResult) await bumpAggregate(tx, M_ZERO);
  });
  return { recorded: true };
}

// ---- Search result click ----
const SearchClickInput = z.object({
  query: z.string().max(400),
  entityType: entityEnum,
  entityId: z.string().min(1).max(64),
  position: z.number().int().min(0).max(1000),
});
export type SearchClickInput = z.input<typeof SearchClickInput>;

export async function recordSearchClick(ctx: IngestContext, raw: unknown): Promise<IngestResult> {
  const settings = await getAnalyticsSettings();
  if (!searchLoggingActive(settings)) return { recorded: false, reason: 'disabled' };
  const parsed = SearchClickInput.safeParse(raw);
  if (!parsed.success) return { recorded: false, reason: 'invalid' };
  const { query, entityType, entityId, position } = parsed.data;
  if (!(await entityIsPublic(entityType, entityId))) return { recorded: false, reason: 'invalid' };
  const { text } = normalizeQuery(query);
  const stored = settings.redactQueries ? redactForStorage(text) : text;
  if (!stored) return { recorded: false, reason: 'invalid' };
  if (isDuplicate(`${ctx.clientKey}:click:${entityId}:${stored}`, DEDUP_WINDOW_MS)) return { recorded: false, reason: 'duplicate' };
  await prisma.$transaction(async (tx) => {
    await tx.searchResultClickEvent.create({ data: { normalizedQuery: stored, entityType, entityId, position } });
    await bumpAggregate(tx, M_CLICK, entityType, entityId);
  });
  return { recorded: true };
}

export const ANALYTICS_METRICS = { M_VIEW, M_SEARCH, M_ZERO, M_CLICK } as const;
