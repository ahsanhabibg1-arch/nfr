import 'server-only';
import { z } from 'zod';
import { prisma } from '../db';
import type { Actor } from './guard';
import { audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';

const need = (a: Actor) => {
  if (!roleHasPermission(a.roles, 'system.config'))
    throw new ServiceError('forbidden', 'Not permitted (system.config).');
};

export const ALLOWED_PLACEMENTS = [
  'homepage-top', 'homepage-bottom',
  'article-end',
  'rodeo-hub-top',
  'event-detail',
  'edition-detail',
  'footer-top',
] as const;
export type GlobalBlockPlacement = (typeof ALLOWED_PLACEMENTS)[number];

const GlobalBlockInput = z.object({
  internalName: z.string().min(1).max(120),
  type: z.enum(['MESSAGE', 'CTA', 'FEATURED_STORY']),
  enabled: z.boolean().optional(),
  content: z.string().max(2000).optional(),
  mediaUrl: z.string().max(500).optional(),
  mediaAlt: z.string().max(300).optional(),
  ctaLabel: z.string().max(120).optional(),
  ctaUrl: z.string().max(500).optional(),
  articleId: z.string().uuid().optional(),
  placements: z.array(z.string()).optional(),
  priority: z.number().int().min(0).max(100).optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
});
export type GlobalBlockInput = z.input<typeof GlobalBlockInput>;

export interface GlobalBlockRow {
  id: string;
  internalName: string;
  type: 'MESSAGE' | 'CTA' | 'FEATURED_STORY';
  enabled: boolean;
  content: string;
  mediaUrl: string | null;
  mediaAlt: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  articleId: string | null;
  placements: string[];
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
}

function validateUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  if (!u) return null;
  if (!/^(\/[^\s]*|https?:\/\/[^\s]+)$/.test(u)) throw new ServiceError('validation', 'Invalid URL.');
  if (/^javascript:/i.test(u)) throw new ServiceError('validation', 'Disallowed URL scheme.');
  if (/<script/i.test(u)) throw new ServiceError('validation', 'Disallowed content.');
  return u;
}

function validatePlacements(placements: string[]): string[] {
  const allowed = new Set<string>(ALLOWED_PLACEMENTS);
  for (const p of placements) {
    if (!allowed.has(p)) throw new ServiceError('validation', `Unsupported placement: "${p}".`);
  }
  return placements;
}

function toRow(r: {
  id: string; internalName: string; type: string; enabled: boolean; content: string;
  mediaUrl: string | null; mediaAlt: string | null; ctaLabel: string | null; ctaUrl: string | null;
  articleId: string | null; placements: string[]; priority: number;
  startsAt: Date | null; endsAt: Date | null;
}): GlobalBlockRow {
  return {
    id: r.id, internalName: r.internalName, type: r.type as GlobalBlockRow['type'],
    enabled: r.enabled, content: r.content,
    mediaUrl: r.mediaUrl, mediaAlt: r.mediaAlt, ctaLabel: r.ctaLabel, ctaUrl: r.ctaUrl,
    articleId: r.articleId, placements: r.placements, priority: r.priority,
    startsAt: r.startsAt?.toISOString() ?? null, endsAt: r.endsAt?.toISOString() ?? null,
  };
}

export async function listGlobalBlocks(): Promise<GlobalBlockRow[]> {
  const rows = await prisma.globalBlock.findMany({ orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }] });
  return rows.map(toRow);
}

export async function createGlobalBlock(actor: Actor, raw: GlobalBlockInput): Promise<{ id: string }> {
  need(actor);
  const v = GlobalBlockInput.parse(raw);
  const placements = validatePlacements(v.placements ?? []);
  const ctaUrl = validateUrl(v.ctaUrl);
  const mediaUrl = validateUrl(v.mediaUrl);
  if (v.articleId) {
    const exists = await prisma.article.findUnique({ where: { id: v.articleId }, select: { id: true } });
    if (!exists) throw new ServiceError('validation', 'Referenced article not found.');
  }
  const r = await prisma.globalBlock.create({
    data: {
      internalName: v.internalName, type: v.type,
      enabled: v.enabled ?? false, content: v.content ?? '',
      mediaUrl, mediaAlt: v.mediaAlt ?? null,
      ctaLabel: v.ctaLabel ?? null, ctaUrl,
      articleId: v.articleId ?? null, placements, priority: v.priority ?? 0,
      startsAt: v.startsAt ? new Date(v.startsAt) : null,
      endsAt: v.endsAt ? new Date(v.endsAt) : null,
      createdById: actor.id, updatedById: actor.id,
    },
  });
  await audit(actor.id, 'global_block.create', 'GlobalBlock', r.id, v.internalName);
  return { id: r.id };
}

export async function updateGlobalBlock(actor: Actor, id: string, raw: GlobalBlockInput): Promise<void> {
  need(actor);
  const v = GlobalBlockInput.parse(raw);
  const existing = await prisma.globalBlock.findUnique({ where: { id } });
  if (!existing) throw new ServiceError('not_found', 'Global block not found.');
  const placements = validatePlacements(v.placements ?? []);
  const ctaUrl = validateUrl(v.ctaUrl);
  const mediaUrl = validateUrl(v.mediaUrl);
  if (v.articleId) {
    const exists = await prisma.article.findUnique({ where: { id: v.articleId }, select: { id: true } });
    if (!exists) throw new ServiceError('validation', 'Referenced article not found.');
  }
  await prisma.globalBlock.update({
    where: { id },
    data: {
      internalName: v.internalName, type: v.type,
      enabled: v.enabled ?? existing.enabled, content: v.content ?? '',
      mediaUrl, mediaAlt: v.mediaAlt ?? null,
      ctaLabel: v.ctaLabel ?? null, ctaUrl,
      articleId: v.articleId ?? null, placements, priority: v.priority ?? 0,
      startsAt: v.startsAt ? new Date(v.startsAt) : null,
      endsAt: v.endsAt ? new Date(v.endsAt) : null,
      updatedById: actor.id,
    },
  });
  await audit(actor.id, 'global_block.update', 'GlobalBlock', id, v.internalName);
}

export async function deleteGlobalBlock(actor: Actor, id: string): Promise<void> {
  need(actor);
  const r = await prisma.globalBlock.findUnique({ where: { id } });
  if (!r) throw new ServiceError('not_found', 'Global block not found.');
  await prisma.globalBlock.delete({ where: { id } });
  await audit(actor.id, 'global_block.delete', 'GlobalBlock', id, r.internalName);
}

export async function toggleGlobalBlockEnabled(actor: Actor, id: string, enabled: boolean): Promise<void> {
  need(actor);
  if (!(await prisma.globalBlock.findUnique({ where: { id } }))) throw new ServiceError('not_found', 'Global block not found.');
  await prisma.globalBlock.update({ where: { id }, data: { enabled, updatedById: actor.id } });
  await audit(actor.id, 'global_block.toggle', 'GlobalBlock', id, enabled ? 'enabled' : 'disabled');
}

export async function getActiveBlocksForPlacement(placement: string): Promise<GlobalBlockRow[]> {
  const now = new Date();
  const rows = await prisma.globalBlock.findMany({
    where: {
      enabled: true,
      placements: { has: placement },
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map(toRow);
}
