'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as svc from '@/lib/cms/siteConfigService';
import type { SiteConfigKey } from '@/lib/cms/siteConfigService';

const rev = () => { revalidatePath('/admin/website/'); revalidatePath('/', 'layout'); };

export async function saveSiteConfigDraftAction(key: SiteConfigKey, data: unknown): Promise<ActionResult> {
  try { const a = await requireActor('system.config'); await svc.saveDraft(a, key, data); rev(); return { ok: true }; }
  catch (e) { return toActionError(e); }
}

export async function publishSiteConfigAction(key: SiteConfigKey): Promise<ActionResult> {
  try { const a = await requireActor('system.config'); await svc.publishConfig(a, key); rev(); return { ok: true }; }
  catch (e) { return toActionError(e); }
}

export async function resetSiteConfigDraftAction(key: SiteConfigKey): Promise<ActionResult> {
  try { const a = await requireActor('system.config'); await svc.resetDraftToPublished(a, key); rev(); return { ok: true }; }
  catch (e) { return toActionError(e); }
}
