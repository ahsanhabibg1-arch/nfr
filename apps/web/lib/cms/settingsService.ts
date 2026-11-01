import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import { getAnalyticsSettings } from '../analytics/config';
import { getMonetizationSettings } from '../monetization/config';

/**
 * System Settings service (Batch 09 §16–§22). Typed + validated configuration (NOT
 * arbitrary key/value mutation). Domain-specific settings stay owned by their modules
 * (SEO/Analytics/Monetization); this surfaces their STATUS and owns only site identity
 * + editorial/rodeo display defaults. Security-critical values (hashing cost, session
 * secrets, DB creds, env) are NEVER editable here. The audit-log viewer is read-only
 * and restricted. All mutations require `system.config` and are audited.
 */
const need = (a: Actor, p: Parameters<typeof roleHasPermission>[1]) => {
  if (!roleHasPermission(a.roles, p)) throw new ServiceError('forbidden', `Not permitted (${p}).`);
};

// No angle brackets → no executable HTML in free-text settings (§17).
const safeText = (max: number) => z.string().max(max).regex(/^[^<>]*$/, 'HTML is not allowed');
const optUrl = z.string().url().max(500).optional().or(z.literal('')).transform((v) => v || undefined);
const optEmail = z.string().email().max(200).optional().or(z.literal('')).transform((v) => v || undefined);

// ---------------- Typed groups ----------------
export const SITE_IDENTITY_KEY = 'site_identity';
export const EDITORIAL_DEFAULTS_KEY = 'editorial_defaults';
export const RODEO_DEFAULTS_KEY = 'rodeo_defaults';

const SiteIdentity = z.object({
  siteName: safeText(120),
  tagline: safeText(240),
  description: safeText(600),
  contactEmail: optEmail,
  editorialEmail: optEmail,
  twitterUrl: optUrl,
  facebookUrl: optUrl,
  instagramUrl: optUrl,
});
export type SiteIdentity = z.infer<typeof SiteIdentity>;
const DEFAULT_SITE_IDENTITY: SiteIdentity = {
  siteName: 'NFRGuide',
  tagline: 'Independent Championship Rodeo Editorial',
  description: 'Independent editorial coverage of the National Finals Rodeo and championship rodeo.',
  contactEmail: undefined, editorialEmail: undefined, twitterUrl: undefined, facebookUrl: undefined, instagramUrl: undefined,
};

const EditorialDefaults = z.object({
  defaultArticleStatus: z.enum(['DRAFT', 'IN_REVIEW']),
  excerptGuidance: safeText(300),
  editorialTimeZone: z.string().max(64),
  wordsPerMinute: z.number().int().min(100).max(400),
  inDepthWordCount: z.number().int().min(200).max(5000),
  attributionGuidance: safeText(300),
  sourceVerificationReminder: z.boolean(),
});
export type EditorialDefaults = z.infer<typeof EditorialDefaults>;
const DEFAULT_EDITORIAL: EditorialDefaults = {
  defaultArticleStatus: 'DRAFT', excerptGuidance: 'Aim for 1–2 sentences summarizing the dispatch.',
  editorialTimeZone: 'America/Los_Angeles', wordsPerMinute: 225, inDepthWordCount: 1000,
  attributionGuidance: 'Credit sources and photographers; verify official rules against the PRCA/WPRA rulebook.',
  sourceVerificationReminder: true,
};

const RodeoDefaults = z.object({
  dateDisplay: z.enum(['absolute', 'relative']),
  showVenue: z.boolean(),
  eventStatusPresentation: z.enum(['badge', 'text']),
  editionSourceReminder: z.boolean(),
});
export type RodeoDefaults = z.infer<typeof RodeoDefaults>;
const DEFAULT_RODEO: RodeoDefaults = { dateDisplay: 'absolute', showVenue: true, eventStatusPresentation: 'badge', editionSourceReminder: true };

async function readGroup<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return { ...fallback, ...((row?.value as Partial<T> | undefined) ?? {}) };
}

export interface SystemSettings { siteIdentity: SiteIdentity; editorial: EditorialDefaults; rodeo: RodeoDefaults }
export async function getSystemSettings(actor: Actor): Promise<SystemSettings> {
  need(actor, 'system.config');
  const [siteIdentity, editorial, rodeo] = await Promise.all([
    readGroup(SITE_IDENTITY_KEY, DEFAULT_SITE_IDENTITY),
    readGroup(EDITORIAL_DEFAULTS_KEY, DEFAULT_EDITORIAL),
    readGroup(RODEO_DEFAULTS_KEY, DEFAULT_RODEO),
  ]);
  return { siteIdentity, editorial, rodeo };
}

async function writeGroup(actor: Actor, key: string, value: unknown, action: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonObject, updatedById: actor.id },
    update: { value: value as Prisma.InputJsonObject, updatedById: actor.id },
  });
  await audit(actor.id, action, 'system_setting', key);
}

export async function updateSiteIdentity(actor: Actor, raw: unknown): Promise<SiteIdentity> {
  need(actor, 'system.config');
  const v = SiteIdentity.parse(raw);
  await writeGroup(actor, SITE_IDENTITY_KEY, v, 'settings.site_identity.update');
  return v;
}
export async function updateEditorialDefaults(actor: Actor, raw: unknown): Promise<EditorialDefaults> {
  need(actor, 'system.config');
  const v = EditorialDefaults.parse(raw);
  await writeGroup(actor, EDITORIAL_DEFAULTS_KEY, v, 'settings.editorial.update');
  return v;
}
export async function updateRodeoDefaults(actor: Actor, raw: unknown): Promise<RodeoDefaults> {
  need(actor, 'system.config');
  const v = RodeoDefaults.parse(raw);
  await writeGroup(actor, RODEO_DEFAULTS_KEY, v, 'settings.rodeo.update');
  return v;
}

// ---------------- Operational status (safe; no secrets) ----------------
export interface OperationalStatus {
  environment: string; appVersion: string; commit: string;
  database: { connected: boolean; migrationsApplied: number | null };
  mediaStorageProvider: string;
  analyticsCollection: boolean;
  adServing: boolean;
  clickTracking: boolean;
  securityNote: string;
}
export async function getOperationalStatus(actor: Actor): Promise<OperationalStatus> {
  need(actor, 'system.config');
  let connected = false;
  let migrationsApplied: number | null = null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    connected = true;
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
    migrationsApplied = Number(rows[0]?.count ?? 0);
  } catch {
    connected = false;
  }
  const [an, mon] = await Promise.all([getAnalyticsSettings(), getMonetizationSettings()]);
  return {
    environment: process.env.NODE_ENV ?? 'unknown',
    appVersion: process.env.APP_VERSION || '0.1.0',
    commit: process.env.APP_COMMIT || 'local',
    database: { connected, migrationsApplied },
    mediaStorageProvider: process.env.MEDIA_STORAGE_PROVIDER || 'local',
    analyticsCollection: an.collectionEnabled,
    adServing: mon.adsenseEnabled,
    clickTracking: mon.clickTrackingEnabled,
    securityNote: 'Password hashing cost, session secrets, DB credentials and environment are code/environment-controlled and are not editable from the CMS.',
  };
}

// ---------------- Audit log viewer (restricted, read-only) ----------------
export interface AuditFilters { actorId?: string; action?: string; from?: string; to?: string; page?: number; pageSize?: number }
export interface AuditRow { id: string; actorId: string | null; actorName: string | null; action: string; entityType: string; entityId: string | null; detail: string | null; createdAt: string }
export interface AuditResult { rows: AuditRow[]; total: number; page: number; pageSize: number; totalPages: number }

export async function listAuditLog(actor: Actor, filters: AuditFilters = {}): Promise<AuditResult> {
  need(actor, 'system.config'); // audit details restricted to SA/Admin
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 25));
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.actorId) where.actorId = filters.actorId;
  if (filters.action) where.action = { contains: filters.action, mode: 'insensitive' };
  if (filters.from || filters.to) where.createdAt = { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lte: new Date(filters.to) } : {}) };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { actor: { select: { name: true } } } }),
    prisma.auditLog.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({ id: r.id, actorId: r.actorId, actorName: r.actor?.name ?? null, action: r.action, entityType: r.entityType, entityId: r.entityId, detail: r.detail, createdAt: r.createdAt.toISOString() })),
    total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export { DEFAULT_SITE_IDENTITY, DEFAULT_EDITORIAL, DEFAULT_RODEO };
