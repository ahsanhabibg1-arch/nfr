'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as rodeo from '@/lib/cms/rodeoService';
import * as deps from '@/lib/cms/rodeoDependencies';
import * as slugSvc from '@/lib/cms/rodeoSlugs';
import type { DependencySnapshot } from '@/lib/cms/rodeoDependencies';
import type { HubInput, EventInput, EditionInput, VenueInput, DisciplineInput, DisciplineCreateInput, RodeoEntityKind } from '@/lib/cms/rodeoService';

const rev = () => { revalidatePath('/admin/rodeo-coverage/'); revalidatePath('/', 'layout'); };
const withId = (p: Promise<{ id: string }>): Promise<ActionResult<{ id: string }>> =>
  p.then((r) => { rev(); return { ok: true as const, ...r }; }).catch((e) => toActionError(e) as ActionResult<{ id: string }>);
const voidAct = (p: Promise<void>): Promise<ActionResult> =>
  p.then(() => { rev(); return { ok: true as const }; }).catch((e) => toActionError(e));

// Hubs
export async function createHubAction(input: HubInput) { try { const a = await requireActor('rodeo.manage'); return withId(rodeo.createHub(a, input)); } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; } }
export async function updateHubAction(id: string, input: HubInput) { try { const a = await requireActor('rodeo.manage'); return voidAct(rodeo.updateHub(a, id, input)); } catch (e) { return toActionError(e); } }
export async function deleteHubAction(id: string) { try { const a = await requireActor('rodeo.manage'); return voidAct(rodeo.deleteHub(a, id)); } catch (e) { return toActionError(e); } }

// Events
export async function createEventAction(input: EventInput) { try { const a = await requireActor('rodeo.manage'); return withId(rodeo.createEvent(a, input)); } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; } }
export async function updateEventAction(id: string, input: EventInput) { try { const a = await requireActor('rodeo.manage'); return voidAct(rodeo.updateEvent(a, id, input)); } catch (e) { return toActionError(e); } }
export async function deleteEventAction(id: string) { try { const a = await requireActor('rodeo.manage'); return voidAct(rodeo.deleteEvent(a, id)); } catch (e) { return toActionError(e); } }

// Editions
export async function createEditionAction(input: EditionInput) { try { const a = await requireActor('rodeo.manage'); return withId(rodeo.createEdition(a, input)); } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; } }
export async function updateEditionAction(id: string, input: Omit<EditionInput, 'eventId' | 'editionSlug'>) { try { const a = await requireActor('rodeo.manage'); return voidAct(rodeo.updateEdition(a, id, input)); } catch (e) { return toActionError(e); } }
export async function deleteEditionAction(id: string) { try { const a = await requireActor('rodeo.manage'); return voidAct(rodeo.deleteEdition(a, id)); } catch (e) { return toActionError(e); } }

// Venues
export async function createVenueAction(input: VenueInput) { try { const a = await requireActor('rodeo.manage'); return withId(rodeo.createVenue(a, input)); } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; } }
export async function updateVenueAction(id: string, input: VenueInput) { try { const a = await requireActor('rodeo.manage'); return voidAct(rodeo.updateVenue(a, id, input)); } catch (e) { return toActionError(e); } }
export async function deleteVenueAction(id: string) { try { const a = await requireActor('rodeo.manage'); return voidAct(rodeo.deleteVenue(a, id)); } catch (e) { return toActionError(e); } }

// Disciplines (Batch 11: editable description/tagline/summary; deep guide JSON preserved)
export async function updateDisciplineAction(id: string, input: DisciplineInput) { try { const a = await requireActor('rodeo.manage'); return voidAct(rodeo.updateDiscipline(a, id, input)); } catch (e) { return toActionError(e); } }
export async function createDisciplineAction(input: DisciplineCreateInput) { try { const a = await requireActor('rodeo.manage'); return withId(rodeo.createDiscipline(a, input)); } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; } }
export async function deleteDisciplineAction(id: string) { try { const a = await requireActor('rodeo.manage'); return voidAct(rodeo.deleteDiscipline(a, id)); } catch (e) { return toActionError(e); } }

// Archive lifecycle — one pair for all five families (see rodeoService).
export async function archiveEntityAction(kind: RodeoEntityKind, id: string) { try { const a = await requireActor('rodeo.manage'); return voidAct(rodeo.archiveEntity(a, kind, id)); } catch (e) { return toActionError(e); } }
export async function reactivateEntityAction(kind: RodeoEntityKind, id: string) { try { const a = await requireActor('rodeo.manage'); return voidAct(rodeo.reactivateEntity(a, kind, id)); } catch (e) { return toActionError(e); } }

/* ── Dependency resolution, transfer, permanent delete, slug change ──
 *
 * `inspectDependenciesAction` is a READ used to build the delete dialog. It
 * still requires `rodeo.manage`: dependency counts describe unpublished
 * editorial structure, and the dialog is an authoring surface.
 */
export async function inspectDependenciesAction(kind: RodeoEntityKind, id: string): Promise<ActionResult<{ snapshot: DependencySnapshot; destinations: { id: string; label: string }[] }>> {
  try {
    await requireActor('rodeo.manage');
    const [snapshot, destinations] = await Promise.all([
      deps.inspectDependencies(kind, id),
      deps.listTransferDestinations(kind, id),
    ]);
    return { ok: true as const, snapshot, destinations };
  } catch (e) {
    return toActionError(e) as ActionResult<{ snapshot: DependencySnapshot; destinations: { id: string; label: string }[] }>;
  }
}

export async function transferDependencyAction(kind: RodeoEntityKind, sourceId: string, groupKey: string, destId: string) {
  try {
    const a = await requireActor('rodeo.manage');
    const r = await deps.transferDependencyGroup(a, kind, sourceId, groupKey, destId);
    rev();
    return { ok: true as const, ...r };
  } catch (e) {
    return toActionError(e) as ActionResult<deps.TransferResult>;
  }
}

export async function permanentDeleteAction(kind: RodeoEntityKind, id: string) {
  try { const a = await requireActor('rodeo.manage'); return voidAct(deps.permanentDeleteEntity(a, kind, id)); } catch (e) { return toActionError(e); }
}

export async function changeSlugAction(kind: RodeoEntityKind, id: string, slug: string) {
  try {
    const a = await requireActor('rodeo.manage');
    const r = await slugSvc.changeSlug(a, kind, id, slug);
    rev();
    /**
     * Purge the exact paths this rename invalidated.
     *
     * The broad `revalidatePath('/', 'layout')` in `rev()` is not enough for a
     * prerendered entity page: the OLD url kept serving its cached 200 instead
     * of the new 308 until its own path was revalidated. Caught by asserting
     * real HTTP responses, not redirect rows.
     */
    for (const p of r.affectedPaths) revalidatePath(p);
    return { ok: true as const, ...r };
  } catch (e) {
    return toActionError(e) as ActionResult<slugSvc.SlugChangeResult>;
  }
}
