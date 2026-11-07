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

const AnnouncementInput = z.object({
  type: z.enum(['BREAKING', 'INFO']),
  text: z.string().min(1).max(500),
  linkUrl: z.string().max(500).optional(),
  linkLabel: z.string().max(120).optional(),
  articleId: z.string().uuid().optional(),
  priority: z.number().int().min(0).max(100).optional(),
  enabled: z.boolean().optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
});
export type AnnouncementInput = z.input<typeof AnnouncementInput>;

export interface AnnouncementRow {
  id: string;
  type: 'BREAKING' | 'INFO';
  text: string;
  linkUrl: string | null;
  linkLabel: string | null;
  articleId: string | null;
  priority: number;
  enabled: boolean;
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

export async function listAnnouncements(): Promise<AnnouncementRow[]> {
  const rows = await prisma.announcement.findMany({ orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }] });
  return rows.map((r) => ({
    id: r.id, type: r.type, text: r.text,
    linkUrl: r.linkUrl, linkLabel: r.linkLabel, articleId: r.articleId,
    priority: r.priority, enabled: r.enabled,
    startsAt: r.startsAt?.toISOString() ?? null, endsAt: r.endsAt?.toISOString() ?? null,
  }));
}

export async function createAnnouncement(actor: Actor, raw: AnnouncementInput): Promise<{ id: string }> {
  need(actor);
  const v = AnnouncementInput.parse(raw);
  const linkUrl = validateUrl(v.linkUrl);
  if (v.articleId) {
    const exists = await prisma.article.findUnique({ where: { id: v.articleId }, select: { id: true } });
    if (!exists) throw new ServiceError('validation', 'Referenced article not found.');
  }
  const r = await prisma.announcement.create({
    data: {
      type: v.type, text: v.text, linkUrl, linkLabel: v.linkLabel ?? null,
      articleId: v.articleId ?? null, priority: v.priority ?? 0,
      enabled: v.enabled ?? false,
      startsAt: v.startsAt ? new Date(v.startsAt) : null,
      endsAt: v.endsAt ? new Date(v.endsAt) : null,
      createdById: actor.id, updatedById: actor.id,
    },
  });
  await audit(actor.id, 'announcement.create', 'Announcement', r.id, v.text.slice(0, 80));
  return { id: r.id };
}

export async function updateAnnouncement(actor: Actor, id: string, raw: AnnouncementInput): Promise<void> {
  need(actor);
  const v = AnnouncementInput.parse(raw);
  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw new ServiceError('not_found', 'Announcement not found.');
  const linkUrl = validateUrl(v.linkUrl);
  if (v.articleId) {
    const exists = await prisma.article.findUnique({ where: { id: v.articleId }, select: { id: true } });
    if (!exists) throw new ServiceError('validation', 'Referenced article not found.');
  }
  await prisma.announcement.update({
    where: { id },
    data: {
      type: v.type, text: v.text, linkUrl, linkLabel: v.linkLabel ?? null,
      articleId: v.articleId ?? null, priority: v.priority ?? 0,
      enabled: v.enabled ?? existing.enabled,
      startsAt: v.startsAt ? new Date(v.startsAt) : null,
      endsAt: v.endsAt ? new Date(v.endsAt) : null,
      updatedById: actor.id,
    },
  });
  await audit(actor.id, 'announcement.update', 'Announcement', id, v.text.slice(0, 80));
}

export async function deleteAnnouncement(actor: Actor, id: string): Promise<void> {
  need(actor);
  const r = await prisma.announcement.findUnique({ where: { id } });
  if (!r) throw new ServiceError('not_found', 'Announcement not found.');
  await prisma.announcement.delete({ where: { id } });
  await audit(actor.id, 'announcement.delete', 'Announcement', id, r.text.slice(0, 80));
}

export async function toggleAnnouncementEnabled(actor: Actor, id: string, enabled: boolean): Promise<void> {
  need(actor);
  if (!(await prisma.announcement.findUnique({ where: { id } }))) throw new ServiceError('not_found', 'Announcement not found.');
  await prisma.announcement.update({ where: { id }, data: { enabled, updatedById: actor.id } });
  await audit(actor.id, 'announcement.toggle', 'Announcement', id, enabled ? 'enabled' : 'disabled');
}

export async function getActiveAnnouncements(limit = 3): Promise<AnnouncementRow[]> {
  const now = new Date();
  const rows = await prisma.announcement.findMany({
    where: {
      enabled: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
    },
    orderBy: [{ type: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id, type: r.type, text: r.text,
    linkUrl: r.linkUrl, linkLabel: r.linkLabel, articleId: r.articleId,
    priority: r.priority, enabled: r.enabled,
    startsAt: r.startsAt?.toISOString() ?? null, endsAt: r.endsAt?.toISOString() ?? null,
  }));
}
