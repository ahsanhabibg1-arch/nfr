'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as svc from '@/lib/cms/disciplineClassificationService';
import type {
  ClassificationCreateInput,
  ClassificationUpdateInput,
} from '@/lib/cms/disciplineClassificationService';

/**
 * Batch 05 — managed Discipline Classification server actions.
 *
 * Same shape, the same `requireActor` gate and the same `toActionError` funnel
 * as the Batch 04-B taxonomy and 04-E Article Type actions, so a `ServiceError`
 * reaches the administrator as its sentence and a Prisma constraint name never
 * surfaces raw.
 *
 * PERMISSION. `rodeo.manage`, the permission that already governs disciplines.
 * A classification only exists to classify a discipline, so inventing a second
 * permission for it would mean two things to keep in step for one editorial
 * responsibility.
 *
 * REVALIDATION IS PER-CHANGE, NOT BLANKET. Each mutation invalidates only the
 * surfaces whose OUTPUT can differ:
 *
 *   create                admin only — a new classification is offered in the
 *                         selectors, but no discipline references it yet, so no
 *                         public page can render differently
 *   rename / description  admin + public — the name and plural are printed on
 *                         the public Competition filter buttons
 *   order                 admin + public — it orders those buttons
 *   active / inactive     admin + public — an inactive classification leaves
 *                         the "offered" list while its disciplines stay
 *                         publicly filterable, so the button set can change
 *   delete                admin only — deletion is refused while any discipline
 *                         references it, so nothing public was showing it
 */
const revAdmin = () => {
  revalidatePath('/admin/rodeo-coverage/');
  // Landing SEO renders the per-discipline Classification selector.
  revalidatePath('/admin/landing-seo/');
};
const revPublic = () => {
  // The Competition section and the discipline guide pages are the only public
  // surfaces that read a classification.
  revalidatePath('/competition/');
  revalidatePath('/disciplines/[slug]/', 'page');
  revalidatePath('/');
};

export async function createClassificationAction(
  input: ClassificationCreateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const a = await requireActor('rodeo.manage');
    const r = await svc.createClassification(a, input);
    revAdmin();
    return { ok: true, ...r };
  } catch (e) {
    return toActionError(e) as ActionResult<{ id: string }>;
  }
}

export async function updateClassificationAction(
  id: string,
  input: ClassificationUpdateInput,
): Promise<ActionResult> {
  try {
    const a = await requireActor('rodeo.manage');
    await svc.updateClassification(a, id, input);
    revAdmin();
    revPublic();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setClassificationActiveAction(id: string, active: boolean): Promise<ActionResult> {
  try {
    const a = await requireActor('rodeo.manage');
    await svc.setClassificationActive(a, id, active);
    revAdmin();
    revPublic();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reorderClassificationsAction(idsInOrder: string[]): Promise<ActionResult> {
  try {
    const a = await requireActor('rodeo.manage');
    await svc.reorderClassifications(a, idsInOrder);
    revAdmin();
    revPublic();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteClassificationAction(id: string): Promise<ActionResult> {
  try {
    const a = await requireActor('rodeo.manage');
    await svc.deleteClassification(a, id);
    revAdmin();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

/**
 * Creates the two pre-existing classifications and attaches existing
 * disciplines, from the Admin.
 *
 * Idempotent, and `apply: false` reports without writing. Offered in the tab
 * only while the registry is empty, so an administrator who applies the
 * migration can initialise it without a shell.
 */
export async function bootstrapClassificationsAction(apply: boolean): Promise<ActionResult<{ report: svc.BootstrapReport }>> {
  try {
    await requireActor('rodeo.manage');
    const report = await svc.bootstrapDisciplineClassifications({ apply });
    if (apply) { revAdmin(); revPublic(); }
    return { ok: true, report };
  } catch (e) {
    return toActionError(e) as ActionResult<{ report: svc.BootstrapReport }>;
  }
}
