'use server';

import { revalidatePath } from 'next/cache';
import { getActor, AuthzError, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as settings from '@/lib/cms/settingsService';

/**
 * System Settings admin Server Actions (Batch 09). `system.config` enforced in the
 * service; typed + validated; audited. No security-critical/env values are editable.
 */
function rev() {
  revalidatePath('/admin/settings/');
}
async function actor() {
  const a = await getActor();
  if (!a) throw new AuthzError('unauthenticated');
  return a;
}

export async function updateSiteIdentityAction(input: unknown): Promise<ActionResult> {
  try {
    await settings.updateSiteIdentity(await actor(), input);
    rev();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
export async function updateEditorialDefaultsAction(input: unknown): Promise<ActionResult> {
  try {
    await settings.updateEditorialDefaults(await actor(), input);
    rev();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
export async function updateRodeoDefaultsAction(input: unknown): Promise<ActionResult> {
  try {
    await settings.updateRodeoDefaults(await actor(), input);
    rev();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
