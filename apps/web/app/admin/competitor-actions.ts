'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as svc from '@/lib/cms/competitorService';
import type { CompetitorInput, ParticipationInput } from '@/lib/cms/competitorService';

const rev = () => { revalidatePath('/admin/competitors/'); revalidatePath('/', 'layout'); };
const withId = (p: Promise<{ id: string }>): Promise<ActionResult<{ id: string }>> =>
  p.then((r) => { rev(); return { ok: true as const, ...r }; }).catch((e) => toActionError(e) as ActionResult<{ id: string }>);
const voidAct = (p: Promise<void>): Promise<ActionResult> =>
  p.then(() => { rev(); return { ok: true as const }; }).catch((e) => toActionError(e));

export async function createCompetitorAction(input: CompetitorInput) {
  try { const a = await requireActor('rodeo.manage'); return withId(svc.createCompetitor(a, input)); } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; }
}
export async function updateCompetitorAction(id: string, input: CompetitorInput) {
  try { const a = await requireActor('rodeo.manage'); return voidAct(svc.updateCompetitor(a, id, input)); } catch (e) { return toActionError(e); }
}
export async function deleteCompetitorAction(id: string) {
  try { const a = await requireActor('rodeo.manage'); return voidAct(svc.deleteCompetitor(a, id)); } catch (e) { return toActionError(e); }
}
export async function setCompetitorDisciplinesAction(id: string, disciplineIds: string[]) {
  try { const a = await requireActor('rodeo.manage'); return voidAct(svc.setCompetitorDisciplines(a, id, disciplineIds)); } catch (e) { return toActionError(e); }
}
export async function addParticipationAction(id: string, input: ParticipationInput) {
  try { const a = await requireActor('rodeo.manage'); return voidAct(svc.addCompetitorParticipation(a, id, input)); } catch (e) { return toActionError(e); }
}
export async function removeParticipationAction(id: string, editionId: string) {
  try { const a = await requireActor('rodeo.manage'); return voidAct(svc.removeCompetitorParticipation(a, id, editionId)); } catch (e) { return toActionError(e); }
}
