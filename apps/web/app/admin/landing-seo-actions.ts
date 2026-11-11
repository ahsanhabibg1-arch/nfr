'use server';

import { revalidatePath } from 'next/cache';
import type { LandingEntityType } from '@prisma/client';
import { getActor, AuthzError, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as entitySeo from '@/lib/cms/entitySeoService';
import * as faq from '@/lib/cms/faqService';
import type { EntitySeoInput } from '@/lib/cms/entitySeoService';
import type { FaqInput } from '@/lib/cms/faqService';

/**
 * Landing-page SEO + FAQ Server Actions (Batch 11). Each action only needs an
 * AUTHENTICATED actor here; the per-entity permission (rodeo.manage for rodeo/
 * discipline, taxonomy.manage for category) is enforced inside the services via
 * `requireEntityPerm`, so category editors are gated correctly (fixing the earlier
 * hardcoded `rodeo.manage`). Every mutation is audited in the service layer.
 */
function rev(entityType?: string, entityId?: string) {
  revalidatePath('/admin/landing-seo/');
  // Revalidate the affected public landing page so overrides/FAQs show immediately.
  revalidatePath('/', 'layout');
  // Stage 09 continuation: EntitySeo.noindex and canonicalOverride decide sitemap
  // membership (lib/seo/sitemapEntries.ts); the sitemap is a metadata route, so
  // revalidate it explicitly rather than relying on the layout purge reaching it.
  revalidatePath('/sitemap.xml');
  void entityType;
  void entityId;
}
async function actor() {
  const a = await getActor();
  if (!a) throw new AuthzError('unauthenticated');
  return a;
}

export async function upsertEntitySeoAction(entityType: LandingEntityType, entityId: string, input: EntitySeoInput): Promise<ActionResult<{ id: string }>> {
  try {
    const r = await entitySeo.upsertEntitySeo(await actor(), entityType, entityId, input);
    rev();
    return { ok: true, id: r.id };
  } catch (e) {
    return toActionError(e) as ActionResult<{ id: string }>;
  }
}

export async function createFaqAction(entityType: LandingEntityType, entityId: string, input: FaqInput): Promise<ActionResult<{ id: string }>> {
  try {
    const r = await faq.createFaq(await actor(), entityType, entityId, input);
    rev();
    return { ok: true, id: r.id };
  } catch (e) {
    return toActionError(e) as ActionResult<{ id: string }>;
  }
}

export async function updateFaqAction(id: string, input: FaqInput): Promise<ActionResult> {
  try {
    await faq.updateFaq(await actor(), id, input);
    rev();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteFaqAction(id: string): Promise<ActionResult> {
  try {
    await faq.deleteFaq(await actor(), id);
    rev();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setFaqEnabledAction(id: string, enabled: boolean): Promise<ActionResult> {
  try {
    await faq.setFaqEnabled(await actor(), id, enabled);
    rev();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function reorderFaqsAction(entityType: LandingEntityType, entityId: string, orderedIds: string[]): Promise<ActionResult> {
  try {
    await faq.reorderFaqs(await actor(), entityType, entityId, orderedIds);
    rev();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
