'use server';

import { revalidatePath } from 'next/cache';
import type { MediaLicenseType, MediaVisibility } from '@prisma/client';
import { getActor, AuthzError, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as media from '@/lib/cms/mediaService';
import type { MediaMetadataInput } from '@/lib/cms/mediaService';

const rev = () => { revalidatePath('/admin/media/'); revalidatePath('/', 'layout'); };
async function actor() { const a = await getActor(); if (!a) throw new AuthzError('unauthenticated'); return a; }

export async function updateMediaMetadataAction(id: string, input: MediaMetadataInput): Promise<ActionResult> {
  try { await media.updateMediaMetadata(await actor(), id, input); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function confirmRightsAction(id: string, licenseType: MediaLicenseType, confirmed: boolean): Promise<ActionResult> {
  try { await media.confirmRights(await actor(), id, licenseType, confirmed); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function setVisibilityAction(id: string, visibility: MediaVisibility): Promise<ActionResult> {
  try { await media.setVisibility(await actor(), id, visibility); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function deleteMediaAction(id: string): Promise<ActionResult> {
  try { await media.deleteMedia(await actor(), id); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function setArticleFeaturedImageAction(articleId: string, mediaId: string | null): Promise<ActionResult> {
  try { await media.setArticleFeaturedImage(await actor(), articleId, mediaId); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function assignRodeoMediaAction(kind: 'hub' | 'event' | 'edition' | 'discipline' | 'venue', entityId: string, mediaId: string, role?: string): Promise<ActionResult> {
  try { await media.assignRodeoMedia(await actor(), kind, entityId, mediaId, role); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function unassignRodeoMediaAction(kind: 'hub' | 'event' | 'edition' | 'discipline' | 'venue', entityId: string, mediaId: string): Promise<ActionResult> {
  try { await media.unassignRodeoMedia(await actor(), kind, entityId, mediaId); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
