'use server';

import { revalidatePath } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as redirects from '@/lib/cms/redirectAdminService';

const ADMIN_PATH = '/admin/seo/redirects/';
const refresh = (...paths: string[]) => {
  revalidatePath(ADMIN_PATH);
  for (const path of new Set(paths)) revalidatePath(path);
};

export async function createRedirectAction(input: redirects.RedirectRuleInput): Promise<ActionResult<{ row: Awaited<ReturnType<typeof redirects.createRedirect>> }>> {
  try { const row = await redirects.createRedirect(await requireActor('redirect.manage'), input); refresh(row.sourcePath); return { ok: true, row }; }
  catch (e) { return toActionError(e) as ActionResult<{ row: Awaited<ReturnType<typeof redirects.createRedirect>> }>; }
}

export async function redirectDetailsAction(id: string): Promise<ActionResult<{
  row: Awaited<ReturnType<typeof redirects.getRedirect>>;
  audit: Awaited<ReturnType<typeof redirects.getRedirectAudit>>;
}>> {
  try {
    const actor = await requireActor('redirect.view');
    const [row, audit] = await Promise.all([
      redirects.getRedirect(actor, id),
      redirects.getRedirectAudit(actor, id),
    ]);
    return { ok: true, row, audit };
  } catch (e) {
    return toActionError(e) as ActionResult<{
      row: Awaited<ReturnType<typeof redirects.getRedirect>>;
      audit: Awaited<ReturnType<typeof redirects.getRedirectAudit>>;
    }>;
  }
}

export async function redirectDiagnosticsAction(page = 1): Promise<ActionResult<{
  diagnostics: Awaited<ReturnType<typeof redirects.getDiagnostics>>;
}>> {
  try {
    const diagnostics = await redirects.getDiagnostics(await requireActor('redirect.diagnostics'), page);
    return { ok: true, diagnostics };
  } catch (e) {
    return toActionError(e) as ActionResult<{
      diagnostics: Awaited<ReturnType<typeof redirects.getDiagnostics>>;
    }>;
  }
}

export async function updateRedirectAction(id: string, input: redirects.RedirectRuleInput): Promise<ActionResult<{ row: Awaited<ReturnType<typeof redirects.updateRedirect>> }>> {
  try {
    const actor = await requireActor('redirect.manage');
    const before = await redirects.getRedirect(actor, id);
    const row = await redirects.updateRedirect(actor, id, input);
    refresh(before.sourcePath, row.sourcePath);
    return { ok: true, row };
  }
  catch (e) { return toActionError(e) as ActionResult<{ row: Awaited<ReturnType<typeof redirects.updateRedirect>> }>; }
}

export async function setRedirectStatusAction(id: string, status: 'ACTIVE' | 'DISABLED'): Promise<ActionResult> {
  try { const row = await redirects.setRedirectStatus(await requireActor('redirect.manage'), id, status); refresh(row.sourcePath); return { ok: true }; }
  catch (e) { return toActionError(e); }
}

export async function deleteRedirectAction(id: string): Promise<ActionResult> {
  try { const result = await redirects.deleteRedirect(await requireActor('redirect.delete'), id); refresh(result.sourcePath); return { ok: true }; }
  catch (e) { return toActionError(e); }
}

export async function bulkStatusAction(ids: string[], status: 'ACTIVE' | 'DISABLED'): Promise<ActionResult<{ count: number; sourcePaths: string[] }>> {
  try { const result = await redirects.bulkSetStatus(await requireActor('redirect.manage'), ids, status); refresh(...result.sourcePaths); return { ok: true, ...result }; }
  catch (e) { return toActionError(e) as ActionResult<{ count: number; sourcePaths: string[] }>; }
}

export async function bulkDeleteAction(ids: string[]): Promise<ActionResult<{ count: number; sourcePaths: string[] }>> {
  try { const result = await redirects.bulkDelete(await requireActor('redirect.delete'), ids); refresh(...result.sourcePaths); return { ok: true, ...result }; }
  catch (e) { return toActionError(e) as ActionResult<{ count: number; sourcePaths: string[] }>; }
}

export async function exportRedirectsAction(filters: redirects.RedirectFilters, ids?: string[]): Promise<ActionResult<{ csv: string }>> {
  try { return { ok: true, csv: await redirects.exportRedirects(await requireActor('redirect.export'), filters, ids) }; }
  catch (e) { return toActionError(e) as ActionResult<{ csv: string }>; }
}

export async function dryRunRedirectCsvAction(text: string): Promise<ActionResult<{ result: Awaited<ReturnType<typeof redirects.dryRunCsvImport>> }>> {
  try { return { ok: true, result: await redirects.dryRunCsvImport(await requireActor('redirect.import'), text) }; }
  catch (e) { return toActionError(e) as ActionResult<{ result: Awaited<ReturnType<typeof redirects.dryRunCsvImport>> }>; }
}

export async function confirmRedirectCsvAction(text: string, token: string): Promise<ActionResult<{ count: number; sourcePaths: string[] }>> {
  try { const result = await redirects.confirmCsvImport(await requireActor('redirect.import'), text, token); refresh(...result.sourcePaths); return { ok: true, ...result }; }
  catch (e) { return toActionError(e) as ActionResult<{ count: number; sourcePaths: string[] }>; }
}
