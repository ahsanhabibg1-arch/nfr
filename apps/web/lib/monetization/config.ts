import 'server-only';
import { prisma } from '../db';

/**
 * Monetization configuration (Batch 08 §9/§18/§19). Single JSON row in
 * `MonetizationConfiguration` (key = "settings"). Everything external is OFF by
 * default (owner-gated, §30): no AdSense script, no publisher id, no click tracking.
 */
export interface MonetizationSettings {
  adsenseEnabled: boolean;
  adsensePublisherId: string | null;
  clickTrackingEnabled: boolean;
  siteDisclosureEnabled: boolean;
}

export const DEFAULT_MONETIZATION_SETTINGS: MonetizationSettings = {
  adsenseEnabled: false,
  adsensePublisherId: null,
  clickTrackingEnabled: false,
  siteDisclosureEnabled: true,
};

export const MONETIZATION_CONFIG_KEY = 'settings';

export async function getMonetizationSettings(): Promise<MonetizationSettings> {
  const row = await prisma.monetizationConfiguration.findUnique({ where: { key: MONETIZATION_CONFIG_KEY } });
  const stored = (row?.value as Partial<MonetizationSettings> | undefined) ?? {};
  return { ...DEFAULT_MONETIZATION_SETTINGS, ...stored };
}
