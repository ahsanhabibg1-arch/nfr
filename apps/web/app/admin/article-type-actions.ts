'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as svc from '@/lib/cms/articleTypeService';
import type { CreateArticleTypeInput, ArticleTypeMetadataInput } from '@/lib/cms/articleTypeService';
import type { ArticleSchemaTypeName } from '@/lib/content/articleTypeShape';

/**
 * Batch 04-E — managed Article Type server actions.
 *
 * Same shape, same `requireActor` gate and the same `toActionError` funnel as
 * the Batch 04-B taxonomy actions, so a `ServiceError` reaches the administrator
 * as its sentence and a Prisma constraint name never surfaces raw.
 *
 * REVALIDATION IS PER-CHANGE, NOT BLANKET (§15). Each mutation invalidates only
 * the surfaces whose OUTPUT can differ, because `revalidatePath('/', 'layout')`
 * discards the entire public render tree and the homepage, article and category
 * pages all regenerate behind it:
 *
 *   label / description   admin + public — the label is printed in the archive
 *                         filter, the article kicker and the draft preview
 *   order                 admin + public — it orders the archive filter
 *   selectable / archive  admin only — lifecycle governs NEW classification;
 *                         published articles and their public pages do not move
 *   evergreen             admin + public — changes which articles the evergreen
 *                         surface may show
 *   schemaType            admin + public — changes the `@type` in article JSON-LD
 *
 * The service also drops the in-process registry cache, so the very next render
 * in THIS process sees the change; the 10 s TTL bounds other instances.
 */
const revAdmin = () => {
  revalidatePath('/admin/editorial-organization/');
  // The editor's dropdown is rendered by these two server pages.
  revalidatePath('/admin/articles/new/');
  revalidatePath('/admin/articles/[id]/edit/', 'page');
};
const revPublic = () => revalidatePath('/', 'layout');

export async function createArticleTypeAction(
  input: CreateArticleTypeInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const a = await requireActor('articletype.manage');
    const r = await svc.createArticleType(a, input);
    revAdmin();
    return { ok: true, ...r };
  } catch (e) {
    return toActionError(e) as ActionResult<{ id: string }>;
  }
}

export async function updateArticleTypeMetadataAction(
  id: string,
  input: ArticleTypeMetadataInput,
): Promise<ActionResult> {
  try {
    const a = await requireActor('articletype.manage');
    await svc.updateArticleTypeMetadata(a, id, input);
    revAdmin();
    revPublic();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reorderArticleTypesAction(idsInOrder: string[]): Promise<ActionResult> {
  try {
    const a = await requireActor('articletype.manage');
    await svc.reorderArticleTypes(a, idsInOrder);
    revAdmin();
    revPublic();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setArticleTypeSelectableAction(id: string, selectable: boolean): Promise<ActionResult> {
  try {
    const a = await requireActor('articletype.manage');
    await svc.setArticleTypeSelectable(a, id, selectable);
    revAdmin();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setArticleTypeArchivedAction(id: string, archived: boolean): Promise<ActionResult> {
  try {
    const a = await requireActor('articletype.manage');
    await svc.setArticleTypeArchived(a, id, archived);
    revAdmin();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteArticleTypeAction(id: string): Promise<ActionResult> {
  try {
    const a = await requireActor('articletype.manage');
    await svc.deleteArticleType(a, id);
    revAdmin();
    revPublic();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

/**
 * Evergreen eligibility — gated by `articletype.seo` (Batch 04-E.1), which only
 * SEO Manager and Super Admin hold. Not `articletype.manage`, and no longer the
 * shared `seo.config` that Administrator also holds.
 */
export async function setArticleTypeEvergreenAction(id: string, evergreen: boolean): Promise<ActionResult> {
  try {
    const a = await requireActor('articletype.seo');
    await svc.setArticleTypeEvergreen(a, id, evergreen);
    revAdmin();
    revPublic();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

/** Article vs NewsArticle — gated by `system.config` (Super Admin only). */
export async function setArticleTypeSchemaTypeAction(
  id: string,
  schemaType: ArticleSchemaTypeName,
): Promise<ActionResult> {
  try {
    const a = await requireActor('system.config');
    await svc.setArticleTypeSchemaType(a, id, schemaType);
    revAdmin();
    revPublic();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

/** Initialise the registry from the in-repository compatibility definitions. */
export async function bootstrapArticleTypesAction(
  apply: boolean,
): Promise<ActionResult<{ created: number; present: number; conflicts: number; tombstoned: string[]; complete: boolean }>> {
  try {
    const a = await requireActor('system.config');
    const r = await svc.runArticleTypeBootstrap(a, apply);
    if (apply) {
      revAdmin();
      revPublic();
    }
    return { ok: true, ...r };
  } catch (e) {
    return toActionError(e) as ActionResult<{
      created: number;
      present: number;
      conflicts: number;
      tombstoned: string[];
      complete: boolean;
    }>;
  }
}
