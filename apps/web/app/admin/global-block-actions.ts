'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as svc from '@/lib/cms/globalBlockService';

const rev = () => { revalidatePath('/admin/website/'); revalidatePath('/', 'layout'); };

export async function createGlobalBlockAction(input: svc.GlobalBlockInput): Promise<ActionResult<{ id: string }>> {
  try { const a = await requireActor('system.config'); const r = await svc.createGlobalBlock(a, input); rev(); return { ok: true, ...r }; }
  catch (e) { return toActionError(e) as ActionResult<{ id: string }>; }
}

export async function updateGlobalBlockAction(id: string, input: svc.GlobalBlockInput): Promise<ActionResult> {
  try { const a = await requireActor('system.config'); await svc.updateGlobalBlock(a, id, input); rev(); return { ok: true }; }
  catch (e) { return toActionError(e); }
}

export async function deleteGlobalBlockAction(id: string): Promise<ActionResult> {
  try { const a = await requireActor('system.config'); await svc.deleteGlobalBlock(a, id); rev(); return { ok: true }; }
  catch (e) { return toActionError(e); }
}

export async function toggleGlobalBlockAction(id: string, enabled: boolean): Promise<ActionResult> {
  try { const a = await requireActor('system.config'); await svc.toggleGlobalBlockEnabled(a, id, enabled); rev(); return { ok: true }; }
  catch (e) { return toActionError(e); }
}
