'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as tax from '@/lib/cms/taxonomyService';
import type { CategoryInput, AuthorInput } from '@/lib/cms/taxonomyService';

const rev = () => { revalidatePath('/admin/editorial-organization/'); revalidatePath('/', 'layout'); };

export async function createCategoryAction(input: CategoryInput): Promise<ActionResult<{ id: string }>> {
  try { const a = await requireActor('taxonomy.manage'); const r = await tax.createCategory(a, input); rev(); return { ok: true, ...r }; }
  catch (e) { return toActionError(e) as ActionResult<{ id: string }>; }
}
export async function updateCategoryAction(id: string, input: CategoryInput): Promise<ActionResult> {
  try { const a = await requireActor('taxonomy.manage'); await tax.updateCategory(a, id, input); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  try { const a = await requireActor('taxonomy.manage'); await tax.deleteCategory(a, id); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function createTagAction(name: string): Promise<ActionResult<{ id: string }>> {
  try { const a = await requireActor('taxonomy.manage'); const r = await tax.createTag(a, name); rev(); return { ok: true, ...r }; } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; }
}
export async function deleteTagAction(id: string): Promise<ActionResult> {
  try { const a = await requireActor('taxonomy.manage'); await tax.deleteTag(a, id); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function createAuthorAction(input: AuthorInput): Promise<ActionResult<{ id: string }>> {
  try { const a = await requireActor('author.manage'); const r = await tax.createAuthor(a, input); rev(); return { ok: true, ...r }; } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; }
}
export async function updateAuthorAction(id: string, input: AuthorInput): Promise<ActionResult> {
  try { const a = await requireActor('author.manage'); await tax.updateAuthor(a, id, input); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function deleteAuthorAction(id: string): Promise<ActionResult> {
  try { const a = await requireActor('author.manage'); await tax.deleteAuthor(a, id); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
