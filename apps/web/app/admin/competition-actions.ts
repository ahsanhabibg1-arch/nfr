'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as svc from '@/lib/cms/competitionService';
import type { SessionInput, ResultInput, StandingInput } from '@/lib/cms/competitionService';
import type { CoverageStatus, CoverageVerification } from '@prisma/client';

const rev = () => { revalidatePath('/admin/competition/'); revalidatePath('/', 'layout'); };
const withId = (p: Promise<{ id: string }>): Promise<ActionResult<{ id: string }>> => p.then((r) => { rev(); return { ok: true as const, ...r }; }).catch((e) => toActionError(e) as ActionResult<{ id: string }>);
const voidAct = (p: Promise<void>): Promise<ActionResult> => p.then(() => { rev(); return { ok: true as const }; }).catch((e) => toActionError(e));
// Returns the new optimistic-concurrency version so the editor can re-sync without a full reload.
const withVersion = (p: Promise<{ version: number }>): Promise<ActionResult<{ version: number }>> => p.then((r) => { rev(); return { ok: true as const, version: r.version }; }).catch((e) => toActionError(e) as ActionResult<{ version: number }>);
const P = 'rodeo.manage' as const;

// Sessions
export async function createSessionAction(input: SessionInput) { try { const a = await requireActor(P); return withId(svc.createSession(a, input)); } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; } }
export async function updateSessionAction(id: string, input: Omit<SessionInput, 'editionId'>, expectedVersion: number) { try { const a = await requireActor(P); return withVersion(svc.updateSession(a, id, input, expectedVersion)); } catch (e) { return toActionError(e) as ActionResult<{ version: number }>; } }
export async function deleteSessionAction(id: string) { try { const a = await requireActor(P); return voidAct(svc.deleteSession(a, id)); } catch (e) { return toActionError(e); } }

// Results
export async function createResultAction(input: ResultInput) { try { const a = await requireActor(P); return withId(svc.createResult(a, input)); } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; } }
export async function updateResultAction(id: string, input: Omit<ResultInput, 'editionId'>, expectedVersion: number) { try { const a = await requireActor(P); return withVersion(svc.updateResult(a, id, input, expectedVersion)); } catch (e) { return toActionError(e) as ActionResult<{ version: number }>; } }
export async function correctResultAction(originalId: string, input: Omit<ResultInput, 'editionId'>) { try { const a = await requireActor(P); return withId(svc.correctResult(a, originalId, input)); } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; } }
export async function deleteResultAction(id: string) { try { const a = await requireActor(P); return voidAct(svc.deleteResult(a, id)); } catch (e) { return toActionError(e); } }

// Standings
export async function createStandingAction(input: StandingInput) { try { const a = await requireActor(P); return withId(svc.createStanding(a, input)); } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; } }
export async function updateStandingAction(id: string, input: Omit<StandingInput, 'editionId'>, expectedVersion: number) { try { const a = await requireActor(P); return withVersion(svc.updateStanding(a, id, input, expectedVersion)); } catch (e) { return toActionError(e) as ActionResult<{ version: number }>; } }
export async function deleteStandingAction(id: string) { try { const a = await requireActor(P); return voidAct(svc.deleteStanding(a, id)); } catch (e) { return toActionError(e); } }

// Verification + publication (shared)
export async function setVerificationAction(kind: 'session' | 'result' | 'standing', id: string, verification: CoverageVerification, source?: { sourceRef?: string; sourceUrl?: string }) { try { const a = await requireActor(P); return voidAct(svc.setVerification(a, kind, id, verification, source)); } catch (e) { return toActionError(e); } }
export async function setCoverageStatusAction(kind: 'session' | 'result' | 'standing', id: string, status: CoverageStatus) { try { const a = await requireActor(P); return voidAct(svc.setCoverageStatus(a, kind, id, status)); } catch (e) { return toActionError(e); } }
