'use server';

import { revalidatePath } from 'next/cache';
import { getActor, AuthzError, toActionError, type ActionResult } from '@/lib/cms/guard';
import {
  saveInfoPageDraft, submitForReview, approveInfoPage,
  publishInfoPage, revertToDraft, unpublishInfoPage,
  archiveInfoPage, restoreInfoPage, deleteInfoPage,
  listInfoPageRevisions, restoreInfoPageRevision,
  type InfoPageInput, type InfoPageRevisionRow,
} from '@/lib/cms/infoPageService';

async function actor() {
  const a = await getActor();
  if (!a) throw new AuthzError('unauthenticated');
  return a;
}

/**
 * Stage 09 continuation (Workstream C/D): a legal slug is in the sitemap only
 * while a published InfoPage exists for it (`lib/seo/sitemapEntries.ts`), and
 * `app/sitemap.ts` is statically cached. Publishing or unpublishing therefore
 * changes sitemap membership and must revalidate it, exactly as
 * `article-actions.ts` already does — otherwise an unpublished (now noindex)
 * page stays advertised in the cached sitemap. Applied inline in the publish
 * and unpublish actions below.
 */
const SITEMAP_PATH = '/sitemap.xml';

/**
 * `expectedVersion` carries the optimistic lock from the editor that loaded the
 * page. It is optional because a first save has no prior version to quote, and
 * omitting it is the one case where a concurrent write cannot be detected — so
 * the admin passes it whenever it has one.
 */
export async function saveInfoPageDraftAction(input: InfoPageInput, expectedVersion?: number): Promise<ActionResult> {
  try {
    await saveInfoPageDraft(await actor(), input, expectedVersion);
    revalidatePath('/admin/info-pages/');
    revalidatePath(`/${input.slug}/`);
    revalidatePath(`/info/${input.slug}/`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function submitForReviewAction(slug: string): Promise<ActionResult> {
  try {
    await submitForReview(await actor(), slug);
    revalidatePath('/admin/info-pages/');
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function approveInfoPageAction(slug: string): Promise<ActionResult> {
  try {
    await approveInfoPage(await actor(), slug);
    revalidatePath('/admin/info-pages/');
    revalidatePath(`/${slug}/`);
    revalidatePath(`/info/${slug}/`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function publishInfoPageAction(slug: string): Promise<ActionResult> {
  try {
    await publishInfoPage(await actor(), slug);
    revalidatePath('/admin/info-pages/');
    revalidatePath(`/${slug}/`);
    revalidatePath(`/info/${slug}/`);
    revalidatePath(SITEMAP_PATH);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function revertToDraftAction(slug: string): Promise<ActionResult> {
  try {
    await revertToDraft(await actor(), slug);
    revalidatePath('/admin/info-pages/');
    revalidatePath(`/${slug}/`);
    revalidatePath(`/info/${slug}/`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function unpublishInfoPageAction(slug: string): Promise<ActionResult> {
  try {
    await unpublishInfoPage(await actor(), slug);
    revalidatePath('/admin/info-pages/');
    revalidatePath(`/${slug}/`);
    revalidatePath(`/info/${slug}/`);
    revalidatePath(SITEMAP_PATH);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

// --- Archive, restore, delete and revisions ---------------------------------

/**
 * Archiving and restoring both change what the public can reach, so both
 * revalidate the page's two possible paths AND the sitemap — the same reason
 * publish and unpublish do. A cached sitemap advertising a withdrawn page is
 * the failure these calls prevent.
 */
function revalidatePage(slug: string): void {
  revalidatePath('/admin/info-pages/');
  revalidatePath(`/${slug}/`);
  revalidatePath(`/info/${slug}/`);
  revalidatePath(SITEMAP_PATH);
}

export async function archiveInfoPageAction(slug: string): Promise<ActionResult> {
  try {
    await archiveInfoPage(await actor(), slug);
    revalidatePage(slug);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function restoreInfoPageAction(slug: string): Promise<ActionResult> {
  try {
    await restoreInfoPage(await actor(), slug);
    revalidatePage(slug);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteInfoPageAction(slug: string): Promise<ActionResult> {
  try {
    await deleteInfoPage(await actor(), slug);
    revalidatePage(slug);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function listInfoPageRevisionsAction(
  slug: string,
): Promise<ActionResult & { revisions?: InfoPageRevisionRow[] }> {
  try {
    return { ok: true, revisions: await listInfoPageRevisions(await actor(), slug) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function restoreInfoPageRevisionAction(slug: string, revisionNo: number): Promise<ActionResult> {
  try {
    await restoreInfoPageRevision(await actor(), slug, revisionNo);
    // Only the DRAFT changes, so the public paths are deliberately NOT
    // revalidated: a restore must not disturb what readers currently see.
    revalidatePath('/admin/info-pages/');
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
