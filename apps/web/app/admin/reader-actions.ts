'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as svc from '@/lib/cms/readerAdminService';

const rev = () => revalidatePath('/admin/readers/');

export async function setReaderStatusAction(id: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<ActionResult> {
  try { const a = await requireActor('reader.manage'); await svc.setReaderStatus(a, id, status); rev(); return { ok: true }; }
  catch (e) { return toActionError(e); }
}

export async function revokeReaderSessionsAction(id: string): Promise<ActionResult> {
  try { const a = await requireActor('reader.manage'); const r = await svc.revokeReaderSessions(a, id); rev(); return { ok: true, revoked: r.revoked }; }
  catch (e) { return toActionError(e); }
}

export async function deleteReaderAction(id: string): Promise<ActionResult> {
  try { const a = await requireActor('reader.manage'); await svc.deleteReader(a, id); rev(); return { ok: true }; }
  catch (e) { return toActionError(e); }
}
