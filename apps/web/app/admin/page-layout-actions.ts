'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as pl from '@/lib/cms/pageLayoutService';
import type { SectionSlot } from '@/lib/cms/sectionRegistry';
import { prisma } from '@/lib/db';
import { ADMIN_LAYOUT_PATH, publishedPathsFor } from '@/lib/cms/layoutCachePaths';

/**
 * SCOPED CACHE INVALIDATION (Stage 08 Task D, owner decision D-08).
 *
 * The previous helper was:
 *
 *     const rev = () => { revalidatePath('/admin/website/'); revalidatePath('/', 'layout'); };
 *
 * and EVERY action called it, including `saveDraftAction`. `revalidatePath('/',
 * 'layout')` invalidates the root layout and therefore the whole public site,
 * so saving an unpublished draft for one page key flushed every public page —
 * including the published version of the page being drafted.
 *
 * Two tiers now, per D-08 option (a):
 *
 *   `revalidateDraft()`   — the admin route only. A draft write changes no
 *                           published artefact, and the staff preview is
 *                           dynamically rendered because it reads draftMode(),
 *                           so there is nothing public to invalidate.
 *   `revalidatePublish()` — the admin route plus exactly the paths that page
 *                           key publishes to, from the authoritative map in
 *                           lib/cms/layoutCachePaths.ts.
 *
 * Which tier each action uses is decided by what it WRITES, not by what it is
 * called: `resetDraftAction`, `restoreDefaultsAction`, `restoreRevisionAction`,
 * `schedulePublishAction` and `cancelScheduleAction` all write draft or
 * schedule columns only, so all five are draft-tier.
 */
const revalidateDraft = () => {
  revalidatePath(ADMIN_LAYOUT_PATH);
};

const revalidatePublish = (pageKey: string) => {
  revalidatePath(ADMIN_LAYOUT_PATH);
  for (const target of publishedPathsFor(pageKey)) {
    revalidatePath(target.path, target.type);
  }
};

export async function saveDraftAction(
  pageKey: string,
  sections: SectionSlot[],
  /**
   * The `PageLayout.version` the editor loaded (Stage 08 Task B, KD-09).
   *
   * REQUIRED, and with no `'unchecked'` escape — unlike the service, which
   * allows that opt-out for scripts and tests. This is the interactive path, so
   * a save arriving without the version the operator actually loaded is the
   * exact condition that used to overwrite another editor's work in silence.
   */
  expectedVersion: number,
): Promise<ActionResult> {
  try {
    const a = await requireActor('system.config');
    const layout = await pl.saveDraft(a, { pageKey, sections, expectedVersion });
    revalidateDraft();
    return { ok: true, version: layout.version };
  } catch (e) { return toActionError(e); }
}

export async function publishLayoutAction(pageKey: string): Promise<ActionResult> {
  try {
    const a = await requireActor('system.config');
    const layout = await pl.publishLayout(a, pageKey);
    revalidatePublish(pageKey);
    return { ok: true, version: layout.version };
  } catch (e) { return toActionError(e); }
}

export async function resetDraftAction(pageKey: string): Promise<ActionResult> {
  try {
    const a = await requireActor('system.config');
    const layout = await pl.resetDraftToPublished(a, pageKey);
    revalidateDraft();
    return { ok: true, version: layout.version };
  } catch (e) { return toActionError(e); }
}

export async function restoreDefaultsAction(pageKey: string): Promise<ActionResult> {
  try {
    const a = await requireActor('system.config');
    const layout = await pl.restoreDefaults(a, pageKey);
    revalidateDraft();
    return { ok: true, version: layout.version };
  } catch (e) { return toActionError(e); }
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

export async function schedulePublishAction(pageKey: string, scheduledAt: string): Promise<ActionResult> {
  try {
    const a = await requireActor('system.config');
    const date = new Date(scheduledAt);
    if (isNaN(date.getTime())) return { ok: false, code: 'validation', error: 'Invalid date.' };
    const layout = await pl.schedulePublish(a, pageKey, date);
    // Draft tier: scheduling writes the scheduled columns, nothing published.
    revalidateDraft();
    return { ok: true, version: layout.version };
  } catch (e) { return toActionError(e); }
}

export async function cancelScheduleAction(pageKey: string): Promise<ActionResult> {
  try {
    const a = await requireActor('system.config');
    const layout = await pl.cancelSchedule(a, pageKey);
    revalidateDraft();
    return { ok: true, version: layout.version };
  } catch (e) { return toActionError(e); }
}

export interface RevisionRow {
  id: string;
  revisionNo: number;
  actorName: string;
  summary: string;
  createdAt: string;
}

export async function listRevisionsAction(pageKey: string): Promise<ActionResult<{ revisions: RevisionRow[]; total: number }>> {
  try {
    const a = await requireActor('system.config');
    const { revisions, total } = await pl.listRevisions(a, pageKey);
    return {
      ok: true,
      revisions: revisions.map((r) => ({
        id: r.id,
        revisionNo: r.revisionNo,
        actorName: r.actorName,
        summary: r.summary,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
    };
  } catch (e) { return toActionError(e) as ActionResult<{ revisions: RevisionRow[]; total: number }>; }
}

export async function restoreRevisionAction(pageKey: string, revisionId: string): Promise<ActionResult> {
  try {
    const a = await requireActor('system.config');
    const layout = await pl.restoreRevision(a, pageKey, revisionId);
    /**
     * Draft tier, and this is the important one for Task D requirement 4:
     * restoring a revision writes `draftSections` only, so it must NOT publish
     * anything. Using the publish tier here would have made a restore appear
     * on the live site.
     */
    revalidateDraft();
    return { ok: true, version: layout.version };
  } catch (e) { return toActionError(e); }
}

export async function getDraftPreviewSections(pageKey: string): Promise<{ ok: true; sections: SectionSlot[] } | { ok: false; error: string }> {
  try {
    await requireActor('system.config');
    const layout = await prisma.pageLayout.findUnique({ where: { pageKey } });
    if (!layout) return { ok: false, error: 'No draft found for this page.' };
    return { ok: true, sections: layout.draftSections as unknown as SectionSlot[] };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }; }
}
