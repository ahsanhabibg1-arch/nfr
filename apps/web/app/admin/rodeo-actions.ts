'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as rodeo from '@/lib/cms/rodeoService';
import type { HubInput, EventInput, EditionInput, VenueInput, DisciplineInput } from '@/lib/cms/rodeoService';

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
