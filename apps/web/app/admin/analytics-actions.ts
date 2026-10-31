'use server';

import { revalidatePath } from 'next/cache';
import { getActor, AuthzError, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as analytics from '@/lib/cms/analyticsService';
import type { SettingsInput, ProviderPatchInput } from '@/lib/cms/analyticsService';
import type { ExternalProviderKey } from '@/lib/analytics/providers';

/**
 * Analytics & Search admin Server Actions (Batch 07). Every action re-derives the
 * actor server-side and enforces RBAC inside the service — the UI only hides controls
 * cosmetically. Audited in the service layer.
 */
const rev = () => revalidatePath('/admin/analytics/');
async function actor() {
  const a = await getActor();
  if (!a) throw new AuthzError('unauthenticated');
  return a;
}

export async function updateAnalyticsConfigAction(input: SettingsInput): Promise<ActionResult> {
  try {
    await analytics.updateAnalyticsConfig(await actor(), input);
    rev();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setProviderConnectionAction(provider: ExternalProviderKey, patch: ProviderPatchInput): Promise<ActionResult> {
  try {
    await analytics.setProviderConnection(await actor(), provider, patch);
    rev();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

type SyncResult = { status: string; message: string };
export async function runProviderSyncAction(provider: ExternalProviderKey): Promise<ActionResult<SyncResult>> {
  try {
    const r = await analytics.runProviderSync(await actor(), provider);
    rev();
    return { ok: true, ...r };
  } catch (e) {
    return toActionError(e) as ActionResult<SyncResult>;
  }
}

type ExportResult = { data: Awaited<ReturnType<typeof analytics.exportAnalytics>> };
export async function exportAnalyticsAction(days: number): Promise<ActionResult<ExportResult>> {
  try {
    const data = await analytics.exportAnalytics(await actor(), days);
    return { ok: true, data };
  } catch (e) {
    return toActionError(e) as ActionResult<ExportResult>;
  }
}

type RetentionResult = { cutoff: string; deleted: { searchQuery: number; searchClick: number; contentView: number } };
export async function runRetentionAction(): Promise<ActionResult<RetentionResult>> {
  try {
    const r = await analytics.runRetention(await actor());
    rev();
    return { ok: true, ...r };
  } catch (e) {
    return toActionError(e) as ActionResult<RetentionResult>;
  }
}
