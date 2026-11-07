'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as pl from '@/lib/cms/pageLayoutService';
import type { SectionSlot } from '@/lib/cms/sectionRegistry';
import { prisma } from '@/lib/db';

const rev = () => { revalidatePath('/admin/website/'); revalidatePath('/', 'layout'); };

export async function saveDraftAction(pageKey: string, sections: SectionSlot[]): Promise<ActionResult> {
  try { const a = await requireActor('system.config'); await pl.saveDraft(a, { pageKey, sections }); rev(); return { ok: true }; }
  catch (e) { return toActionError(e); }
}

export async function publishLayoutAction(pageKey: string): Promise<ActionResult> {
  try { const a = await requireActor('system.config'); await pl.publishLayout(a, pageKey); rev(); return { ok: true }; }
  catch (e) { return toActionError(e); }
}

export async function resetDraftAction(pageKey: string): Promise<ActionResult> {
  try { const a = await requireActor('system.config'); await pl.resetDraftToPublished(a, pageKey); rev(); return { ok: true }; }
  catch (e) { return toActionError(e); }
}

export async function restoreDefaultsAction(pageKey: string): Promise<ActionResult> {
  try { const a = await requireActor('system.config'); await pl.restoreDefaults(a, pageKey); rev(); return { ok: true }; }
  catch (e) { return toActionError(e); }
}

export interface FeaturedPickerItem {
  id: string; title: string; slug: string; type: string;
  imageUrl?: string; publishedAt?: string; excerpt?: string;
}

export async function listFeaturedCandidatesAction(
  q: string, entityType: string,
): Promise<{ ok: true; items: FeaturedPickerItem[] } | { ok: false; error: string }> {
  try {
    await requireActor('system.config');
    const items: FeaturedPickerItem[] = [];
    if (entityType === 'article' || !entityType) {
      const articles = await prisma.article.findMany({
        where: {
          workflowStatus: 'PUBLISHED',
          ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
        },
        select: { id: true, title: true, slug: true, heroImageUrl: true, publishedAt: true, excerpt: true },
        orderBy: { publishedAt: 'desc' },
        take: 20,
      });
      items.push(...articles.map((a) => ({
        id: a.id, title: a.title, slug: a.slug, type: 'article',
        imageUrl: a.heroImageUrl ?? undefined,
        publishedAt: a.publishedAt?.toISOString(),
        excerpt: a.excerpt?.slice(0, 80),
      })));
    }
    if (entityType === 'rodeo-hub' || !entityType) {
      const hubs = await prisma.rodeoHub.findMany({
        where: q ? { title: { contains: q, mode: 'insensitive' as const } } : {},
        select: { id: true, title: true, slug: true },
        orderBy: { title: 'asc' },
        take: 10,
      });
      items.push(...hubs.map((h) => ({ id: h.id, title: h.title, slug: h.slug, type: 'rodeo-hub' })));
    }
    return { ok: true, items };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }; }
}

export async function resolveArticleDetailsAction(
  ids: string[],
): Promise<{ ok: true; items: FeaturedPickerItem[] } | { ok: false; error: string }> {
  try {
    await requireActor('system.config');
    if (!ids.length || ids.length > 50) return { ok: true, items: [] };
    const articles = await prisma.article.findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, slug: true, heroImageUrl: true, publishedAt: true, excerpt: true },
    });
    const map = new Map(articles.map((a) => [a.id, a]));
    const items: FeaturedPickerItem[] = ids
      .filter((id) => map.has(id))
      .map((id) => {
        const a = map.get(id)!;
        return {
          id: a.id, title: a.title, slug: a.slug, type: 'article',
          imageUrl: a.heroImageUrl ?? undefined,
          publishedAt: a.publishedAt?.toISOString(),
          excerpt: a.excerpt?.slice(0, 80),
        };
      });
    return { ok: true, items };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }; }
}

export async function getDraftPreviewSections(pageKey: string): Promise<{ ok: true; sections: SectionSlot[] } | { ok: false; error: string }> {
  try {
    await requireActor('system.config');
    const layout = await prisma.pageLayout.findUnique({ where: { pageKey } });
    if (!layout) return { ok: false, error: 'No draft found for this page.' };
    return { ok: true, sections: layout.draftSections as unknown as SectionSlot[] };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }; }
}
