import 'server-only';

/**
 * External analytics provider FOUNDATION (Batch 07 §13/§14). This is a clean
 * interface + honest status reporting ONLY. It performs NO network calls, pulls in
 * NO Google SDK, stores NO credentials, and NEVER fabricates data.
 *
 * A provider is reported as connected only when real, authorized credentials are
 * configured in the environment AND the owner has approved enabling sync — neither
 * of which happens in this batch. With nothing configured, every provider resolves
 * to `not_connected`, which is exactly what the dashboard shows. Live ingestion is a
 * future, owner-gated step (§24). See EXTERNAL_ANALYTICS_INTEGRATION.md.
 */
export type ExternalProviderKey = 'GOOGLE_SEARCH_CONSOLE' | 'GOOGLE_ANALYTICS_4';

export type ProviderState = 'not_connected' | 'configured' | 'connected' | 'error' | 'disabled';

export interface ProviderDescriptor {
  provider: ExternalProviderKey;
  displayName: string;
  kind: string; // the distinct system this represents (§14)
  requiredEnv: string[];
  setupDoc: string;
  summary: string;
}

export interface ProviderStatus extends ProviderDescriptor {
  state: ProviderState;
  detail: string;
  /** True only when real authorized live data is available (always false this batch). */
  live: boolean;
}

export const PROVIDERS: Record<ExternalProviderKey, ProviderDescriptor> = {
  GOOGLE_SEARCH_CONSOLE: {
    provider: 'GOOGLE_SEARCH_CONSOLE',
    displayName: 'Google Search Console',
    kind: 'External search performance (clicks, impressions, CTR, position) for verified pages',
    requiredEnv: ['GSC_SITE_URL', 'GOOGLE_APPLICATION_CREDENTIALS'],
    setupDoc: 'EXTERNAL_ANALYTICS_INTEGRATION.md#google-search-console',
    summary:
      'Requires a verified domain property and an authorized service account. No data is estimated or inferred from internal search.',
  },
  GOOGLE_ANALYTICS_4: {
    provider: 'GOOGLE_ANALYTICS_4',
    displayName: 'Google Analytics 4',
    kind: 'GA4 Data API reporting (sessions, users, engagement) — distinct from GA4 browser collection and from first-party analytics',
    requiredEnv: ['GA4_PROPERTY_ID', 'GOOGLE_APPLICATION_CREDENTIALS'],
    setupDoc: 'EXTERNAL_ANALYTICS_INTEGRATION.md#google-analytics-4',
    summary:
      'Requires a GA4 property id and an authorized service account for the Data API. No tracking script is injected and no measurement id is hardcoded.',
  },
};

function envConfigured(keys: string[]): boolean {
  return keys.length > 0 && keys.every((k) => typeof process.env[k] === 'string' && process.env[k]!.length > 0);
}

/**
 * Resolve the honest status from the environment. Even when env is present we report
 * `configured` (not `connected`): live ingestion is deliberately not enabled in this
 * batch and remains owner-gated.
 */
export function describeProvider(provider: ExternalProviderKey): ProviderStatus {
  const d = PROVIDERS[provider];
  const configured = envConfigured(d.requiredEnv);
  return {
    ...d,
    state: configured ? 'configured' : 'not_connected',
    live: false,
    detail: configured
      ? 'Credentials detected, but live sync is disabled pending owner approval. No external data is being ingested.'
      : `Not connected. Set ${d.requiredEnv.join(' + ')} and complete owner-approved setup to enable.`,
  };
}

export function describeAllProviders(): ProviderStatus[] {
  return (Object.keys(PROVIDERS) as ExternalProviderKey[]).map(describeProvider);
}

export class ProviderNotConnectedError extends Error {
  constructor(public provider: ExternalProviderKey) {
    super(`Provider ${provider} is not connected`);
  }
}

/** Future ingestion entry point. Throws until a real, approved connection exists. */
export async function fetchProviderReport(provider: ExternalProviderKey): Promise<never> {
  throw new ProviderNotConnectedError(provider);
}
