'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as svc from '@/lib/cms/commentService';

const rev = () => revalidatePath('/admin/comments/');

export async function moderateCommentAction(id: string, status: 'APPROVED' | 'REJECTED' | 'HIDDEN', reason?: string): Promise<ActionResult> {
  try { const a = await requireActor('comment.moderate'); await svc.moderateComment(a, id, status, reason); rev(); return { ok: true }; }
  catch (e) { return toActionError(e); }
}

export async function deleteCommentAction(id: string): Promise<ActionResult> {
  try { const a = await requireActor('comment.delete'); await svc.deleteComment(a, id); rev(); return { ok: true }; }
  catch (e) { return toActionError(e); }
}
