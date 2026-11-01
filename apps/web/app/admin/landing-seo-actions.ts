'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as entitySeo from '@/lib/cms/entitySeoService';
import * as faq from '@/lib/cms/faqService';
import type { EntitySeoInput } from '@/lib/cms/entitySeoService';
import type { FaqInput } from '@/lib/cms/faqService';

const rev = () => { revalidatePath('/admin/landing-seo/'); revalidatePath('/', 'layout'); };
const voidAct = (p: Promise<void>): Promise<ActionResult> =>
  p.then(() => { rev(); return { ok: true as const }; }).catch((e) => toActionError(e));

// SEO actions
export async function upsertEntitySeoAction(entityType: string, entityId: string, input: EntitySeoInput) {
  try { const a = await requireActor('rodeo.manage'); const r = await entitySeo.upsertEntitySeo(a, entityType as any, entityId, input); rev(); return { ok: true, id: r.id }; } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; }
}

// FAQ actions
export async function createFaqAction(entityType: string, entityId: string, input: FaqInput) {
  try { const a = await requireActor('rodeo.manage'); const r = await faq.createFaq(a, entityType as any, entityId, input); rev(); return { ok: true, id: r.id }; } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; }
}
export async function updateFaqAction(id: string, input: FaqInput) {
  try { const a = await requireActor('rodeo.manage'); const r = await faq.updateFaq(a, id, input); rev(); return { ok: true, id: r.id }; } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; }
}
export async function deleteFaqAction(id: string) {
  try { const a = await requireActor('rodeo.manage'); await faq.deleteFaq(a, id); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function setFaqEnabledAction(id: string, enabled: boolean) {
  try { const a = await requireActor('rodeo.manage'); await faq.setFaqEnabled(a, id, enabled); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function reorderFaqsAction(entityType: string, entityId: string, orderedIds: string[]) {
  try { const a = await requireActor('rodeo.manage'); await faq.reorderFaqs(a, entityType as any, entityId, orderedIds); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
