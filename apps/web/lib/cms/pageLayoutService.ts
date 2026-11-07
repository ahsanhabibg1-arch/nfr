import 'server-only';
import type { PageLayout } from '@prisma/client';
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
        const isUrlProp = key.toLowerCase().includes('url') || key.toLowerCase().includes('image');
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

  const result = await prisma.pageLayout.update({
    where: { pageKey },
    data: {
      publishedSections: JSON.parse(JSON.stringify(layout.draftSections)),
      publishedAt: new Date(),
      publishedById: actor.id,
      updatedById: actor.id,
    },
  });
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
