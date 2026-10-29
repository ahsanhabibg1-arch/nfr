'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as nav from '@/lib/cms/navigationService';
import type { NavInput } from '@/lib/cms/navigationService';

// Navigation affects every public page's chrome, so revalidate the whole layout.
const rev = () => { revalidatePath('/admin/website/'); revalidatePath('/', 'layout'); };

export async function createNavItemAction(input: NavInput): Promise<ActionResult<{ id: string }>> {
  try { const a = await requireActor('navigation.manage'); const r = await nav.createNavItem(a, input); rev(); return { ok: true, ...r }; }
  catch (e) { return toActionError(e) as ActionResult<{ id: string }>; }
}
export async function updateNavItemAction(id: string, input: NavInput): Promise<ActionResult> {
  try { const a = await requireActor('navigation.manage'); await nav.updateNavItem(a, id, input); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function deleteNavItemAction(id: string): Promise<ActionResult> {
  try { const a = await requireActor('navigation.manage'); await nav.deleteNavItem(a, id); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function setNavVisibleAction(id: string, visible: boolean): Promise<ActionResult> {
  try { const a = await requireActor('navigation.manage'); await nav.setNavVisible(a, id, visible); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function restoreCanonicalNavAction(): Promise<ActionResult<{ created: number; skipped: number }>> {
  try { const a = await requireActor('navigation.manage'); const r = await nav.restoreCanonicalNav(a); rev(); return { ok: true, ...r }; }
  catch (e) { return toActionError(e) as ActionResult<{ created: number; skipped: number }>; }
}
