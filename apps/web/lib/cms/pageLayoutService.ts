import 'server-only';
import type { PageLayout, PageLayoutRevision } from '@prisma/client';
import { prisma } from '../db';
import { roleHasPermission } from '../auth/rbac';
import type { Actor } from './guard';
import { audit } from './guard';
import { ServiceError } from './articleService';
import { z } from 'zod';
import { type SectionSlot, getPageFamily, buildDefaultSlots, getSectionsForFamily, KNOWN_PAGE_KEYS, ensureSlotIds, getAvailableBlockTypes } from './sectionRegistry';

const need = (a: Actor) => {
  if (!roleHasPermission(a.roles, 'system.config'))
    throw new ServiceError('forbidden', 'Not permitted (system.config).');
};

const SectionSlotSchema = z.object({
  id: z.string().min(1),
  sectionType: z.string().min(1),
  visible: z.boolean(),
  order: z.number().int().min(0),
  props: z.record(z.string(), z.unknown()),
});

const UpdateDraftSchema = z.object({
  pageKey: z.string().min(1).max(120),
  sections: z.array(SectionSlotSchema).max(50),
});

function validateSectionTypes(pageKey: string, slots: SectionSlot[]): void {
  const family = getPageFamily(pageKey);
  const available = getAvailableBlockTypes(family);
  const allowed = new Set(available.map((d) => d.type));
  for (const s of slots) {
    if (!allowed.has(s.sectionType)) {
      throw new ServiceError('validation', `Section type "${s.sectionType}" is not allowed for page family "${family}".`);
    }
    for (const [key, val] of Object.entries(s.props)) {
      if (typeof val === 'string') {
        if (val.length > 2000) throw new ServiceError('validation', `Prop "${key}" exceeds 2000 characters.`);
        if (/<script/i.test(val)) throw new ServiceError('validation', `Prop "${key}" contains disallowed content.`);
        // URL-bearing props are named *Url (heroImageUrl, ctaUrl, imageUrl). Matching on
        // "image" also caught heroImageAlt / imageAlt / imagePosition and rejected plain text.
        const isUrlProp = /url$/i.test(key);
        if (isUrlProp && val.length > 0) {
          if (!/^(\/[^\s]*|https?:\/\/[^\s]+)$/.test(val)) {
            throw new ServiceError('validation', `Prop "${key}" must be a relative path or https URL.`);
          }
          if (/^javascript:/i.test(val)) throw new ServiceError('validation', `Prop "${key}" contains disallowed URL scheme.`);
        }
      }
    }
  }
}

function validateBlockLimits(pageKey: string, slots: SectionSlot[]): void {
  const family = getPageFamily(pageKey);
  const available = getAvailableBlockTypes(family);
  const defMap = new Map(available.map((d) => [d.type, d]));
  const counts = new Map<string, number>();
  for (const s of slots) {
    counts.set(s.sectionType, (counts.get(s.sectionType) ?? 0) + 1);
  }
  for (const [type, count] of counts) {
    const def = defMap.get(type);
    if (def?.maxInstances && count > def.maxInstances) {
      throw new ServiceError('validation', `Block "${type}" exceeds max instances (${def.maxInstances}).`);
    }
  }
}

function validateUniqueIds(slots: SectionSlot[]): void {
  const ids = new Set<string>();
  for (const s of slots) {
    if (ids.has(s.id)) throw new ServiceError('validation', `Duplicate block ID "${s.id}".`);
    ids.add(s.id);
  }
}

export async function getPageLayout(pageKey: string): Promise<PageLayout | null> {
  return prisma.pageLayout.findUnique({ where: { pageKey } });
}

export async function getPublishedSections(pageKey: string): Promise<SectionSlot[]> {
  try {
    const layout = await prisma.pageLayout.findUnique({ where: { pageKey } });
    if (!layout) return buildDefaultSlots(getPageFamily(pageKey));
    const sections = layout.publishedSections as unknown as SectionSlot[];
    if (!Array.isArray(sections) || sections.length === 0) return buildDefaultSlots(getPageFamily(pageKey));
    return ensureSlotIds(sections);
  } catch {
    return buildDefaultSlots(getPageFamily(pageKey));
  }
}

export async function getDraftSections(pageKey: string): Promise<SectionSlot[]> {
  try {
    const layout = await prisma.pageLayout.findUnique({ where: { pageKey } });
    if (!layout) return buildDefaultSlots(getPageFamily(pageKey));
    const sections = layout.draftSections as unknown as SectionSlot[];
    if (!Array.isArray(sections) || sections.length === 0) return buildDefaultSlots(getPageFamily(pageKey));
    return ensureSlotIds(sections);
  } catch {
    return buildDefaultSlots(getPageFamily(pageKey));
  }
}

export async function listPageLayouts(): Promise<PageLayout[]> {
  try {
    return await prisma.pageLayout.findMany({ orderBy: { pageKey: 'asc' } });
  } catch {
    return [];
  }
}

function validatePageKey(pageKey: string): void {
  const knownSet = new Set<string>(KNOWN_PAGE_KEYS);
  if (!knownSet.has(pageKey)) {
    throw new ServiceError('validation', `Unknown page key "${pageKey}".`);
  }
}

export async function saveDraft(actor: Actor, input: { pageKey: string; sections: SectionSlot[] }): Promise<PageLayout> {
  need(actor);
  const data = UpdateDraftSchema.parse(input);
  validatePageKey(data.pageKey);
  validateSectionTypes(data.pageKey, data.sections);
  validateBlockLimits(data.pageKey, data.sections);
  validateUniqueIds(data.sections);

  const result = await prisma.pageLayout.upsert({
    where: { pageKey: data.pageKey },
    create: {
      pageKey: data.pageKey,
      draftSections: JSON.parse(JSON.stringify(data.sections)),
      updatedById: actor.id,
    },
    update: {
      draftSections: JSON.parse(JSON.stringify(data.sections)),
      updatedById: actor.id,
    },
  });
  await audit(actor.id, 'page_layout.draft_save', 'PageLayout', result.id, JSON.stringify({ pageKey: data.pageKey }));
  return result;
}

export async function publishLayout(actor: Actor, pageKey: string): Promise<PageLayout> {
  need(actor);
  const layout = await prisma.pageLayout.findUnique({ where: { pageKey } });
  if (!layout) throw new ServiceError('not_found', `No layout found for "${pageKey}".`);

  const sections = JSON.parse(JSON.stringify(layout.draftSections));
  const actorName = await resolveActorName(actor.id);

  const [result] = await prisma.$transaction([
    prisma.pageLayout.update({
      where: { pageKey },
      data: {
        publishedSections: sections,
        publishedAt: new Date(),
        publishedById: actor.id,
        updatedById: actor.id,
      },
    }),
    prisma.pageLayoutRevision.create({
      data: {
        pageKey,
        revisionNo: await nextRevisionNo(pageKey),
        snapshot: sections,
        actorId: actor.id,
        actorName,
        summary: 'Immediate publish',
      },
    }),
  ]);
  await audit(actor.id, 'page_layout.publish', 'PageLayout', result.id, JSON.stringify({ pageKey }));
  return result;
}

export async function resetDraftToPublished(actor: Actor, pageKey: string): Promise<PageLayout> {
  need(actor);
  const layout = await prisma.pageLayout.findUnique({ where: { pageKey } });
  if (!layout) throw new ServiceError('not_found', `No layout found for "${pageKey}".`);

  const result = await prisma.pageLayout.update({
    where: { pageKey },
    data: {
      draftSections: JSON.parse(JSON.stringify(layout.publishedSections)),
      updatedById: actor.id,
    },
  });
  await audit(actor.id, 'page_layout.reset_draft', 'PageLayout', result.id, JSON.stringify({ pageKey }));
  return result;
}

export async function restoreDefaults(actor: Actor, pageKey: string): Promise<PageLayout> {
  need(actor);
  const family = getPageFamily(pageKey);
  const defaults = buildDefaultSlots(family);

  const result = await prisma.pageLayout.upsert({
    where: { pageKey },
    create: {
      pageKey,
      draftSections: JSON.parse(JSON.stringify(defaults)),
      updatedById: actor.id,
    },
    update: {
      draftSections: JSON.parse(JSON.stringify(defaults)),
      updatedById: actor.id,
    },
  });
  await audit(actor.id, 'page_layout.restore_defaults', 'PageLayout', result.id, JSON.stringify({ pageKey }));
  return result;
}

/* ── Scheduled Publishing ──────────────────────────────────────── */

export async function schedulePublish(
  actor: Actor,
  pageKey: string,
  scheduledAt: Date,
): Promise<PageLayout> {
  need(actor);
  validatePageKey(pageKey);
  if (scheduledAt.getTime() <= Date.now()) {
    throw new ServiceError('validation', 'Scheduled time must be in the future.');
  }
  const layout = await prisma.pageLayout.findUnique({ where: { pageKey } });
  if (!layout) throw new ServiceError('not_found', `No layout found for "${pageKey}".`);
  const draft = layout.draftSections as unknown as SectionSlot[];
  if (!Array.isArray(draft) || draft.length === 0) {
    throw new ServiceError('validation', 'Cannot schedule an empty draft.');
  }

  const result = await prisma.pageLayout.update({
    where: { pageKey },
    data: {
      scheduledSections: JSON.parse(JSON.stringify(draft)),
      scheduledAt,
      scheduledById: actor.id,
      updatedById: actor.id,
    },
  });
  await audit(actor.id, 'page_layout.schedule', 'PageLayout', result.id, JSON.stringify({ pageKey, scheduledAt: scheduledAt.toISOString() }));
  return result;
}

export async function cancelSchedule(actor: Actor, pageKey: string): Promise<PageLayout> {
  need(actor);
  const layout = await prisma.pageLayout.findUnique({ where: { pageKey } });
  if (!layout) throw new ServiceError('not_found', `No layout found for "${pageKey}".`);
  if (!layout.scheduledAt) throw new ServiceError('validation', 'No schedule exists for this page.');

  const result = await prisma.pageLayout.update({
    where: { pageKey },
    data: {
      scheduledSections: null as unknown as undefined,
      scheduledAt: null,
      scheduledById: null,
      updatedById: actor.id,
    },
  });
  await audit(actor.id, 'page_layout.cancel_schedule', 'PageLayout', result.id, JSON.stringify({ pageKey }));
  return result;
}

export async function getDueSchedules(): Promise<PageLayout[]> {
  return prisma.pageLayout.findMany({
    where: {
      scheduledAt: { lte: new Date() },
      scheduledSections: { not: { equals: null } },
    },
  });
}

export async function executeScheduledPublish(layout: PageLayout): Promise<PageLayout | null> {
  const scheduled = layout.scheduledSections as unknown as SectionSlot[];
  if (!Array.isArray(scheduled) || scheduled.length === 0) return null;

  const sections = JSON.parse(JSON.stringify(scheduled));

  const { count } = await prisma.pageLayout.updateMany({
    where: {
      id: layout.id,
      scheduledAt: { not: null },
      scheduledSections: { not: { equals: null } },
    },
    data: {
      publishedSections: sections,
      publishedAt: new Date(),
      publishedById: layout.scheduledById,
      scheduledSections: null as unknown as undefined,
      scheduledAt: null,
      scheduledById: null,
      version: { increment: 1 },
    },
  });

  if (count === 0) return null;

  const actorName = await resolveActorName(layout.scheduledById);
  await prisma.pageLayoutRevision.create({
    data: {
      pageKey: layout.pageKey,
      revisionNo: await nextRevisionNo(layout.pageKey),
      snapshot: sections,
      actorId: layout.scheduledById,
      actorName,
      summary: 'Scheduled publish',
    },
  });

  const result = await prisma.pageLayout.findUnique({ where: { id: layout.id } });
  if (result) {
    await audit(layout.scheduledById, 'page_layout.scheduled_publish', 'PageLayout', result.id, JSON.stringify({ pageKey: layout.pageKey }));
  }
  return result;
}

/* ── Revision History ─────────────────────────────────────────── */

async function resolveActorName(actorId: string | null | undefined): Promise<string> {
  if (!actorId) return 'System';
  const user = await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } });
  return user?.name ?? 'Unknown';
}

async function nextRevisionNo(pageKey: string): Promise<number> {
  const last = await prisma.pageLayoutRevision.findFirst({
    where: { pageKey },
    orderBy: { revisionNo: 'desc' },
    select: { revisionNo: true },
  });
  return (last?.revisionNo ?? 0) + 1;
}

export async function listRevisions(
  pageKey: string,
  opts?: { limit?: number; offset?: number },
): Promise<{ revisions: Omit<PageLayoutRevision, 'snapshot'>[]; total: number }> {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const [revisions, total] = await Promise.all([
    prisma.pageLayoutRevision.findMany({
      where: { pageKey },
      select: { id: true, pageKey: true, revisionNo: true, actorId: true, actorName: true, summary: true, createdAt: true },
      orderBy: { revisionNo: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.pageLayoutRevision.count({ where: { pageKey } }),
  ]);
  return { revisions: revisions as Omit<PageLayoutRevision, 'snapshot'>[], total };
}

export async function getRevision(revisionId: string): Promise<PageLayoutRevision | null> {
  return prisma.pageLayoutRevision.findUnique({ where: { id: revisionId } });
}

export async function restoreRevision(actor: Actor, pageKey: string, revisionId: string): Promise<PageLayout> {
  need(actor);
  validatePageKey(pageKey);

  const revision = await prisma.pageLayoutRevision.findUnique({ where: { id: revisionId } });
  if (!revision) throw new ServiceError('not_found', 'Revision not found.');
  if (revision.pageKey !== pageKey) throw new ServiceError('validation', 'Revision does not belong to this page.');

  const layout = await prisma.pageLayout.findUnique({ where: { pageKey } });
  if (!layout) throw new ServiceError('not_found', `No layout found for "${pageKey}".`);

  const result = await prisma.pageLayout.update({
    where: { pageKey },
    data: {
      draftSections: revision.snapshot as object,
      updatedById: actor.id,
    },
  });

  await audit(actor.id, 'page_layout.restore_revision', 'PageLayout', result.id, JSON.stringify({ pageKey, revisionId, revisionNo: revision.revisionNo }));
  return result;
}
