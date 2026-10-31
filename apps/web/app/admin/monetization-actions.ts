'use server';

import { revalidatePath } from 'next/cache';
import { getActor, AuthzError, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as mon from '@/lib/cms/monetizationService';

/**
 * Monetization admin Server Actions (Batch 08). Every action re-derives the actor and
 * enforces RBAC inside the service (default-deny) and writes an AuditLog row. The UI
 * only hides controls cosmetically. (In a 'use server' module every export must be an
 * async function.)
 */
function rev() {
  revalidatePath('/admin/monetization/');
}
async function actor() {
  const a = await getActor();
  if (!a) throw new AuthzError('unauthenticated');
  return a;
}
async function run<T>(fn: (a: Awaited<ReturnType<typeof actor>>) => Promise<T>): Promise<ActionResult<{ data: T }>> {
  try {
    const data = await fn(await actor());
    rev();
    return { ok: true, data };
  } catch (e) {
    return toActionError(e) as ActionResult<{ data: T }>;
  }
}

// Partners
export async function createPartnerAction(i: mon.PartnerInput) {
  return run((a) => mon.createPartner(a, i));
}
export async function updatePartnerAction(id: string, i: mon.PartnerInput) {
  return run((a) => mon.updatePartner(a, id, i));
}
export async function setPartnerActiveAction(id: string, active: boolean) {
  return run((a) => mon.setPartnerActive(a, id, active));
}
export async function setPartnerVerificationAction(id: string, status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED', note?: string) {
  return run((a) => mon.setPartnerVerification(a, id, status, note));
}
export async function deletePartnerAction(id: string) {
  return run((a) => mon.deletePartner(a, id));
}

// Links
export async function createLinkAction(i: mon.LinkInput) {
  return run((a) => mon.createLink(a, i));
}
export async function updateLinkAction(id: string, i: mon.LinkInput) {
  return run((a) => mon.updateLink(a, id, i));
}
export async function setLinkActiveAction(id: string, active: boolean) {
  return run((a) => mon.setLinkActive(a, id, active));
}
export async function deleteLinkAction(id: string) {
  return run((a) => mon.deleteLink(a, id));
}

// Placements
export async function createPlacementAction(i: mon.PlacementInput) {
  return run((a) => mon.createArticlePlacement(a, i));
}
export async function setPlacementActiveAction(id: string, active: boolean) {
  return run((a) => mon.setPlacementActive(a, id, active));
}
export async function deletePlacementAction(id: string) {
  return run((a) => mon.deletePlacement(a, id));
}

// Associations (rodeo)
export async function createAssociationAction(i: mon.AssociationInput) {
  return run((a) => mon.createAssociation(a, i));
}
export async function setAssociationActiveAction(id: string, active: boolean) {
  return run((a) => mon.setAssociationActive(a, id, active));
}
export async function deleteAssociationAction(id: string) {
  return run((a) => mon.deleteAssociation(a, id));
}

// Ad placements
export async function createAdPlacementAction(i: mon.AdInput) {
  return run((a) => mon.createAdPlacement(a, i));
}
export async function setAdPlacementEnabledAction(id: string, enabled: boolean) {
  return run((a) => mon.setAdPlacementEnabled(a, id, enabled));
}
export async function deleteAdPlacementAction(id: string) {
  return run((a) => mon.deleteAdPlacement(a, id));
}

// Disclosures
export async function upsertDisclosureAction(i: mon.DisclosureInput) {
  return run((a) => mon.upsertDisclosure(a, i));
}

// Sponsored content
export async function createSponsoredAction(i: mon.SponsoredInput) {
  return run((a) => mon.createSponsored(a, i));
}
export async function setSponsoredActiveAction(id: string, active: boolean) {
  return run((a) => mon.setSponsoredActive(a, id, active));
}
export async function deleteSponsoredAction(id: string) {
  return run((a) => mon.deleteSponsored(a, id));
}

// Config
export async function updateMonetizationConfigAction(i: mon.ConfigInput) {
  return run((a) => mon.updateMonetizationConfig(a, i));
}
