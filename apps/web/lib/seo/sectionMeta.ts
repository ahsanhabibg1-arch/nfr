/**
 * Batch S / S2 — search metadata for the five primary section landing pages.
 *
 * Ownership (owner decision, Batch S):
 *   - SectionConfig (via getSectionMeta) owns the VISIBLE section identity — name, tagline,
 *     description — and supplies the derived/default metadata below. Unchanged by S2.
 *   - EntitySeo(SECTION, <section id>) owns SEARCH METADATA overrides only: SEO title,
 *     meta description, canonical override, OG image, noindex. Merged via the existing
 *     `mergeSeoMeta` (blank field → derived value; noindex is additive; canonical is
 *     same-site only via `resolveCanonical`).
 *
 * The EntitySeo key is `PRIMARY_SECTIONS[key].id` — the same id the Landing SEO admin
 * saves under (lib/cms/landingAdminService.ts `row('SECTION', s.id, …)`) and validates
 * (lib/cms/landingEntities.ts `id in PRIMARY_SECTIONS`). All five ids equal their keys:
 * competition, entertainment, events-shopping, plan-watch, rodeo-events.
 */
import type { EntitySeo } from '@prisma/client';
import type { SectionMeta } from '../../config/routes';
import { mergeSeoMeta, type DerivedMeta } from '../cms/entitySeoService';
import type { buildMetadata } from '../seo';

/** EntitySeo entityId for a section — the admin's key (PRIMARY_SECTIONS[...].id). */
export function sectionSeoEntityId(meta: Pick<SectionMeta, 'id'>): string {
  return meta.id;
}

/** The section page's pre-S2 metadata, used as the fallback for every blank override. */
export function sectionDerivedMeta(meta: Pick<SectionMeta, 'name' | 'description' | 'path'>): DerivedMeta {
  return {
    title: `${meta.name} — Coverage & Guides`,
    description: meta.description,
    path: meta.path,
  };
}

/** Input for `buildMetadata` for a section landing page. `seo` = EntitySeo(SECTION, id) or null. */
export function sectionMetadataInput(
  meta: Pick<SectionMeta, 'name' | 'description' | 'path'>,
  seo: EntitySeo | null,
): Parameters<typeof buildMetadata>[0] {
  return mergeSeoMeta(seo, sectionDerivedMeta(meta));
}
