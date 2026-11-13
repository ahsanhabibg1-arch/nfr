'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as tax from '@/lib/cms/taxonomyService';
import type { CategoryInput, AuthorInput, SubcategoryInput } from '@/lib/cms/taxonomyService';

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
/**
 * Batch 04-B — managed Subcategory actions.
 *
 * Same shape, same permission and the same `toActionError` funnel as the
 * Category actions above, so a `ServiceError` reaches the editor as its
 * message and a Prisma constraint error never surfaces raw.
 */
export async function createSubcategoryAction(input: SubcategoryInput): Promise<ActionResult<{ id: string }>> {
  try { const a = await requireActor('taxonomy.manage'); const r = await tax.createSubcategory(a, input); rev(); return { ok: true, ...r }; }
  catch (e) { return toActionError(e) as ActionResult<{ id: string }>; }
}
export async function updateSubcategoryAction(id: string, input: SubcategoryInput): Promise<ActionResult> {
  try { const a = await requireActor('taxonomy.manage'); await tax.updateSubcategory(a, id, input); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function setSubcategoryArchivedAction(id: string, archived: boolean): Promise<ActionResult> {
  try { const a = await requireActor('taxonomy.manage'); await tax.setSubcategoryArchived(a, id, archived); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
export async function deleteSubcategoryAction(id: string): Promise<ActionResult> {
  try { const a = await requireActor('taxonomy.manage'); await tax.deleteSubcategory(a, id); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
}
/** Options for the article editor's selector, filtered to one primary section. */
export async function listAssignableSubcategoriesAction(
  categoryId: string,
): Promise<ActionResult<{ rows: { id: string; name: string }[] }>> {
  try {
    await requireActor('cms.access');
    return { ok: true, rows: await tax.listAssignableSubcategories(categoryId) };
  } catch (e) { return toActionError(e) as ActionResult<{ rows: { id: string; name: string }[] }>; }
}

export async function createTagAction(name: string): Promise<ActionResult<{ id: string }>> {
  try { const a = await requireActor('taxonomy.manage'); const r = await tax.createTag(a, name); rev(); return { ok: true, ...r }; } catch (e) { return toActionError(e) as ActionResult<{ id: string }>; }
}
/** Stage 03 (G-03) — rename in place; article associations are untouched. */
export async function updateTagAction(id: string, name: string): Promise<ActionResult> {
  try { const a = await requireActor('taxonomy.manage'); await tax.updateTag(a, id, name); rev(); return { ok: true }; } catch (e) { return toActionError(e); }
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
