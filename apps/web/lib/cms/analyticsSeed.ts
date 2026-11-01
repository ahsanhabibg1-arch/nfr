import type { PrismaClient, AnalyticsProvider } from '@prisma/client';

/**
 * Idempotent analytics seed (Batch 07). Create-missing-only: materializes the two
 * external provider connection rows as NOT_CONNECTED so they appear honestly in the
 * dashboard and sync-run foreign keys resolve. Never overwrites administrator-set
 * fields (propertyRef/status) and never touches AnalyticsConfig (collection stays
 * disabled-by-default via the config fallback).
 *
 * The provider display names are inlined here (not imported from the `server-only`
 * `lib/analytics/providers` module) so this runs under plain tsx (`prisma db seed`)
 * and vitest without a loader hook — honoring the "no server-only" contract.
 */
const PROVIDER_SEED: { provider: AnalyticsProvider; displayName: string }[] = [
  { provider: 'GOOGLE_SEARCH_CONSOLE', displayName: 'Google Search Console' },
  { provider: 'GOOGLE_ANALYTICS_4', displayName: 'Google Analytics 4' },
];

export async function seedAnalyticsDefaults(db: PrismaClient): Promise<{ providers: number }> {
  let providers = 0;
  for (const { provider, displayName } of PROVIDER_SEED) {
    const existing = await db.analyticsProviderConnection.findUnique({ where: { provider } });
    if (!existing) {
      await db.analyticsProviderConnection
        .create({ data: { provider, displayName, status: 'NOT_CONNECTED' } })
        .catch(() => undefined); // tolerate a concurrent create
      providers++;
    }
  }
  return { providers };
}
