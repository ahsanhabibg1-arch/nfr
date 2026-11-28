'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as svc from '@/lib/cms/siteConfigService';
import type { SiteConfigKey } from '@/lib/cms/siteConfigService';

/**
 * Stage 06-R FC-05A — branding is GLOBAL chrome, so it needs a wider purge.
 *
 * `revalidatePath('/', 'layout')` did not reach the reader authentication pages
 * in practice: `/login/` and `/register/` are separately cached entries, and an
 * end-to-end test caught them still serving the previous logo after a publish
 * that the homepage and footer had already picked up. Branding appears on every
 * page, so the paths that render it are purged explicitly rather than relying
 * on the cascade.
 *
 * Only for the `identity` key: the footer and appearance configs do not appear
 * on the auth screens, and purging extra routes on every save would discard
 * cache entries for no reason.
 */
const BRANDING_PATHS = ['/login/', '/register/'];

const rev = (key?: SiteConfigKey) => {
  revalidatePath('/admin/website/');
  revalidatePath('/', 'layout');
  if (key === 'identity') for (const p of BRANDING_PATHS) revalidatePath(p);
};

export async function saveSiteConfigDraftAction(key: SiteConfigKey, data: unknown): Promise<ActionResult> {
  try { const a = await requireActor('system.config'); await svc.saveDraft(a, key, data); rev(key); return { ok: true }; }
  catch (e) { return toActionError(e); }
}

export async function publishSiteConfigAction(key: SiteConfigKey): Promise<ActionResult> {
  try { const a = await requireActor('system.config'); await svc.publishConfig(a, key); rev(key); return { ok: true }; }
  catch (e) { return toActionError(e); }
}

export async function resetSiteConfigDraftAction(key: SiteConfigKey): Promise<ActionResult> {
  try { const a = await requireActor('system.config'); await svc.resetDraftToPublished(a, key); rev(key); return { ok: true }; }
  catch (e) { return toActionError(e); }
}
