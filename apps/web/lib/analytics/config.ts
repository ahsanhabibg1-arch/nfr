import 'server-only';
import { prisma } from '../db';

/**
 * Analytics configuration (Batch 07 §8/§9). Persisted as a single JSON row in
 * `AnalyticsConfig` (key = "settings"), mirroring the SeoConfig pattern.
 *
 * Collection is DISABLED BY DEFAULT (owner-approved, §8/§24): the full pipeline is
 * implemented but records nothing until an administrator enables it from the admin
 * config screen after settling a privacy/consent approach. The sub-toggles
 * (search/content-view) only take effect while `collectionEnabled` is true.
 *
 * All timestamps are stored in UTC; `displayTimeZone` documents the single reporting
 * zone used across the dashboard (UTC — §19).
 */
export interface AnalyticsSettings {
  collectionEnabled: boolean;
  searchLoggingEnabled: boolean;
  contentViewEnabled: boolean;
  retentionDays: number;
  redactQueries: boolean;
  displayTimeZone: string;
}

export const DEFAULT_ANALYTICS_SETTINGS: AnalyticsSettings = {
  collectionEnabled: false, // §8/§24 — off until owner enables after privacy sign-off
  searchLoggingEnabled: true,
  contentViewEnabled: true,
  retentionDays: 180,
  redactQueries: true,
  displayTimeZone: 'UTC',
};

export const ANALYTICS_CONFIG_KEY = 'settings';
export const MIN_RETENTION_DAYS = 7;
export const MAX_RETENTION_DAYS = 400;

export async function getAnalyticsSettings(): Promise<AnalyticsSettings> {
  const row = await prisma.analyticsConfig.findUnique({ where: { key: ANALYTICS_CONFIG_KEY } });
  const stored = (row?.value as Partial<AnalyticsSettings> | undefined) ?? {};
  return { ...DEFAULT_ANALYTICS_SETTINGS, ...stored };
}

/** True only when the master switch AND the per-category switch are both on. */
export function searchLoggingActive(s: AnalyticsSettings): boolean {
  return s.collectionEnabled && s.searchLoggingEnabled;
}
export function contentViewActive(s: AnalyticsSettings): boolean {
  return s.collectionEnabled && s.contentViewEnabled;
}
