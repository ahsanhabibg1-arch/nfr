'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { requireActor, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as svc from '@/lib/cms/searchEngineService';
import { SEARCH_META_TAG } from '@/lib/cms/searchEngineService';

/**
 * Server Actions for search engine verification, tracking ids and indexing
 * diagnostics.
 *
 * EVERY ONE REQUIRES `system.config`, enforced inside `requireActor` before any
 * work happens — not checked in the UI, which an attacker does not run. The
 * service checks the same permission again, so a future caller that forgets
 * cannot bypass it.
 *
 * A saved verification record changes the PUBLIC document head, so the public
 * layout's cache is invalidated here. Without that, an administrator would save
 * a tag, check it, and be told truthfully that it is absent — because the
 * cached page is still the old one. The cache invalidation is what makes the
 * check meaningful.
 */

const PUBLIC_LAYOUT = '/';

/**
 * Makes the public head reflect the change immediately.
 *
 * The TAG is what matters: the public pages are rendered with ISR, so without
 * invalidating the tagged read they would keep serving the previous head until
 * their window elapsed — up to five minutes. An administrator who saved a tag
 * and pressed Check was told it was not being served, which is true and
 * useless. The path revalidation goes with it so the rendered HTML is rebuilt,
 * not just the data behind it.
 */
function revalidatePublicHead(): void {
  /*
    `updateTag`, not `revalidateTag`: in Next 16 the latter takes a cache-life
    profile and expires lazily, while this needs read-your-own-writes — the
    administrator presses Check immediately after saving, and the answer has to
    be about the record they just wrote.
  */
  updateTag(SEARCH_META_TAG);
  revalidatePath(PUBLIC_LAYOUT, 'layout');
}

export async function getSearchEngineConfigAction(): Promise<ActionResult<{ config: svc.SearchEngineConfig }>> {
  try {
    const actor = await requireActor('system.config');
    return { ok: true, config: await svc.getSearchEngineConfig(actor) };
  } catch (e) {
    return toActionError(e) as ActionResult<{ config: svc.SearchEngineConfig }>;
  }
}

export async function saveVerificationRecordAction(
  input: svc.SaveVerificationInput,
): Promise<ActionResult<{ record: svc.VerificationRecord }>> {
  try {
    const actor = await requireActor('system.config');
    const record = await svc.saveVerificationRecord(actor, input);
    revalidatePublicHead();
    return { ok: true, record };
  } catch (e) {
    return toActionError(e) as ActionResult<{ record: svc.VerificationRecord }>;
  }
}

export async function deleteVerificationRecordAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requireActor('system.config');
    await svc.deleteVerificationRecord(actor, id);
    revalidatePublicHead();
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

/**
 * Checks whether the tag is really being served.
 *
 * The cache is invalidated FIRST, so the check reads a freshly rendered page
 * rather than the one that was cached before the record was saved. Otherwise a
 * correct configuration would report "absent" purely because of timing, and an
 * administrator would start chasing a problem that does not exist.
 */
export async function checkVerificationRecordAction(
  id: string,
): Promise<ActionResult<{ record: svc.VerificationRecord }>> {
  try {
    const actor = await requireActor('system.config');
    revalidatePublicHead();
    const record = await svc.checkVerificationRecord(actor, id);
    return { ok: true, record };
  } catch (e) {
    return toActionError(e) as ActionResult<{ record: svc.VerificationRecord }>;
  }
}

export async function saveDnsRecordAction(
  input: svc.SaveDnsInput,
): Promise<ActionResult<{ record: svc.DnsRecord }>> {
  try {
    const actor = await requireActor('system.config');
    // No cache invalidation: a DNS record is not part of any page.
    return { ok: true, record: await svc.saveDnsRecord(actor, input) };
  } catch (e) {
    return toActionError(e) as ActionResult<{ record: svc.DnsRecord }>;
  }
}

export async function deleteDnsRecordAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requireActor('system.config');
    await svc.deleteDnsRecord(actor, id);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function checkDnsRecordAction(id: string): Promise<ActionResult<{ record: svc.DnsRecord }>> {
  try {
    const actor = await requireActor('system.config');
    return { ok: true, record: await svc.checkDnsRecord(actor, id) };
  } catch (e) {
    return toActionError(e) as ActionResult<{ record: svc.DnsRecord }>;
  }
}

export async function updateTrackingAction(
  raw: unknown,
): Promise<ActionResult<{ tracking: svc.TrackingSettings }>> {
  try {
    const actor = await requireActor('system.config');
    const tracking = await svc.updateTracking(actor, raw);
    // Switching tracking on or off changes what every public page loads.
    revalidatePublicHead();
    return { ok: true, tracking };
  } catch (e) {
    return toActionError(e) as ActionResult<{ tracking: svc.TrackingSettings }>;
  }
}

export async function getIndexingHealthAction(): Promise<ActionResult<{ health: svc.IndexingHealth }>> {
  try {
    const actor = await requireActor('system.config');
    return { ok: true, health: await svc.getIndexingHealth(actor) };
  } catch (e) {
    return toActionError(e) as ActionResult<{ health: svc.IndexingHealth }>;
  }
}

export async function listVerificationAuditAction(): Promise<ActionResult<{ rows: Awaited<ReturnType<typeof svc.listVerificationAudit>> }>> {
  try {
    const actor = await requireActor('system.config');
    return { ok: true, rows: await svc.listVerificationAudit(actor) };
  } catch (e) {
    return toActionError(e) as ActionResult<{ rows: Awaited<ReturnType<typeof svc.listVerificationAudit>> }>;
  }
}
