'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as svc from '@/lib/cms/sourceService';
import type { SourceInput } from '@/lib/cms/sourceService';

export async function createSourceAction(input: SourceInput): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireActor('source.manage');
    const r = await svc.createSource(actor, input);
    revalidatePath('/admin/sources/');
    return { ok: true, ...r };
  } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; }
}

export async function updateSourceAction(id: string, input: SourceInput): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireActor('source.manage');
    const r = await svc.updateSource(actor, id, input);
    revalidatePath('/admin/sources/');
    return { ok: true, ...r };
  } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; }
}

export async function setSourceStatusAction(id: string, status: 'VERIFIED' | 'NEEDS_REVIEW' | 'EXPIRED'): Promise<ActionResult> {
  try {
    const actor = await requireActor('source.manage');
    await svc.setSourceStatus(actor, id, status);
    revalidatePath('/admin/sources/');
    return { ok: true };
  } catch (e) { return toActionError(e); }
}

export async function deleteSourceAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requireActor('source.manage');
    await svc.deleteSource(actor, id);
    revalidatePath('/admin/sources/');
    return { ok: true };
  } catch (e) { return toActionError(e); }
}
