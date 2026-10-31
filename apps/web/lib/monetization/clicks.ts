import 'server-only';
import { prisma } from '../db';
import { getMonetizationSettings } from './config';
import { getAnalyticsSettings } from '../analytics/config';
import { isDuplicate } from '../analytics/rateLimit';

/**
 * Outbound affiliate click recording (Batch 08 §18). Privacy-conscious and
 * owner-gated: it requires BOTH the monetization click-tracking switch AND the
 * Batch 07 first-party analytics collection switch to be enabled — it never bypasses
 * the analytics configuration. No identifiers are stored; only a per-link per-day
 * count. Rapid duplicates (same transient client key) are dropped.
 */
export type ClickReason = 'disabled' | 'invalid' | 'duplicate';
export interface ClickResult {
  recorded: boolean;
  reason?: ClickReason;
}

function utcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function recordOutboundClick(ctx: { clientKey: string }, linkId: string): Promise<ClickResult> {
  const [mon, an] = await Promise.all([getMonetizationSettings(), getAnalyticsSettings()]);
  if (!mon.clickTrackingEnabled || !an.collectionEnabled) return { recorded: false, reason: 'disabled' };
  if (!linkId) return { recorded: false, reason: 'invalid' };
  const link = await prisma.affiliateLink.findUnique({ where: { id: linkId }, select: { id: true, isActive: true } });
  if (!link || !link.isActive) return { recorded: false, reason: 'invalid' };
  if (isDuplicate(`${ctx.clientKey}:aff:${linkId}`, 30_000)) return { recorded: false, reason: 'duplicate' };
  const day = utcDay();
  await prisma.affiliateClickAggregate.upsert({
    where: { linkId_day: { linkId, day } },
    create: { linkId, day, count: 1 },
    update: { count: { increment: 1 } },
  });
  return { recorded: true };
}
