'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as svc from '@/lib/cms/announcementService';

const rev = () => { revalidatePath('/admin/website/'); revalidatePath('/', 'layout'); };

export async function createAnnouncementAction(input: svc.AnnouncementInput): Promise<ActionResult<{ id: string }>> {
  try { const a = await requireActor('system.config'); const r = await svc.createAnnouncement(a, input); rev(); return { ok: true, ...r }; }
  catch (e) { return toActionError(e) as ActionResult<{ id: string }>; }
}

export async function updateAnnouncementAction(id: string, input: svc.AnnouncementInput): Promise<ActionResult> {
  try { const a = await requireActor('system.config'); await svc.updateAnnouncement(a, id, input); rev(); return { ok: true }; }
  catch (e) { return toActionError(e); }
}

export async function deleteAnnouncementAction(id: string): Promise<ActionResult> {
  try { const a = await requireActor('system.config'); await svc.deleteAnnouncement(a, id); rev(); return { ok: true }; }
  catch (e) { return toActionError(e); }
}

export async function toggleAnnouncementAction(id: string, enabled: boolean): Promise<ActionResult> {
  try { const a = await requireActor('system.config'); await svc.toggleAnnouncementEnabled(a, id, enabled); rev(); return { ok: true }; }
  catch (e) { return toActionError(e); }
}
