import type { PrismaClient } from '@prisma/client';
import { PROVIDERS } from '../analytics/providers';

/**
 * Idempotent analytics seed (Batch 07). Create-missing-only: materializes the two
 * external provider connection rows as NOT_CONNECTED so they appear honestly in the
 * dashboard and sync-run foreign keys resolve. Never overwrites administrator-set
 * fields (propertyRef/status) and never touches AnalyticsConfig (collection stays
 * disabled-by-default via the config fallback). No `server-only` — used by the CLI
 * seed and tests. Safe to re-run.
 */
export async function seedAnalyticsDefaults(db: PrismaClient): Promise<{ providers: number }> {
  let providers = 0;
  for (const key of Object.keys(PROVIDERS) as (keyof typeof PROVIDERS)[]) {
    const d = PROVIDERS[key];
    const existing = await db.analyticsProviderConnection.findUnique({ where: { provider: key } });
    if (!existing) {
      await db.analyticsProviderConnection
        .create({ data: { provider: key, displayName: d.displayName, status: 'NOT_CONNECTED' } })
        .catch(() => undefined); // tolerate a concurrent create
      providers++;
    }
  }
  return { providers };
}
