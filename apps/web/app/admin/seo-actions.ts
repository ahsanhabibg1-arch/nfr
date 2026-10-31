'use server';

import { revalidatePath } from 'next/cache';
import { getActor, AuthzError, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as seo from '@/lib/cms/seoService';
import type { FindingPatchInput, ThresholdsInput } from '@/lib/cms/seoService';
import type { AuditScope } from '@/lib/seo-intel/types';

const rev = () => revalidatePath('/admin/seo/');
async function actor() { const a = await getActor(); if (!a) throw new AuthzError('unauthenticated'); return a; }

export async function runSeoAuditAction(scope: AuditScope): Promise<ActionResult<{ auditRunId: string; total: number; created: number; reopened: number; resolved: number }>> {
  try { const r = await seo.runSeoAudit(await actor(), scope); rev(); return { ok: true, ...r }; }
  catch (e) { return toActionError(e) as ActionResult<{ auditRunId: string; total: number; created: number; reopened: number; resolved: number }>; }
}
export async function updateFindingAction(id: string, patch: FindingPatchInput): Promise<ActionResult> {
  try { await seo.updateFinding(await actor(), id, patch); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function recheckFindingAction(id: string): Promise<ActionResult<{ status: string }>> {
  try { const r = await seo.recheckFinding(await actor(), id); rev(); return { ok: true, ...r }; }
  catch (e) { return toActionError(e) as ActionResult<{ status: string }>; }
}
export async function setRuleEnabledAction(code: string, enabled: boolean): Promise<ActionResult> {
  try { await seo.setRuleEnabled(await actor(), code, enabled); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function updateSeoThresholdsAction(input: ThresholdsInput): Promise<ActionResult> {
  try { await seo.updateSeoThresholds(await actor(), input); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
