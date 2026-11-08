import 'server-only';
import { z } from 'zod';
import type { LandingEntityType, EntitySeo } from '@prisma/client';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { ServiceError } from './articleService';
import { requireEntityPerm, assertEntityExists } from './landingEntities';
import { SITE_URL, buildMetadata } from '../seo';
import { combineRobots, EDITOR_NOINDEX, INDEX_FOLLOW, LEGACY_NOINDEX } from '../seo/robots';
import { normalizeSameSiteCanonical } from '../seo/canonical';

/**
 * Editor-controlled SEO overrides for landing entities (Batch 11). Public reads are
 * unauthenticated (used by generateMetadata/sitemap); mutations require the entity's
 * owning permission + existence check + audit. `noindex` is additive-only — the page
 * combines it with content-based noindex and can never force-index a thin/unpublished
 * entity (Safeguard 2). Canonical overrides are restricted to this site.
 */
export async function getEntitySeo(entityType: LandingEntityType, entityId: string): Promise<EntitySeo | null> {
  return prisma.entitySeo.findUnique({ where: { entityType_entityId: { entityType, entityId } } });
}

/**
 * Resolve a stored canonical override to an absolute, same-site URL, or null.
 * Batch S5: uses the single normalizer (lib/seo/canonical.ts) — same-site only (off-site /
 * malformed → null, never emitted), re-based on SITE_URL, one trailing slash, no query or
 * fragment — so render, save validation, sitemap and audit all agree.
 */
export function resolveCanonical(override: string | null | undefined): string | null {
  return normalizeSameSiteCanonical(override, SITE_URL);
}

const Input = z.object({
  seoTitle: z.string().max(160).optional().nullable(),
  metaDescription: z.string().max(320).optional().nullable(),
  canonicalOverride: z.string().max(500).optional().nullable(),
  ogImage: z.string().max(500).optional().nullable(),
  noindex: z.boolean().default(false),
  intro: z.string().max(4000).regex(/^[^<>]*$/s, 'HTML is not allowed').optional().nullable(),
});
export type EntitySeoInput = z.input<typeof Input>;

function validateCanonicalOverride(v: string | null | undefined): void {
  if (!v || !v.trim()) return;
  // Same rule as rendering (resolveCanonical): a value is accepted only if it would be emitted.
  if (!normalizeSameSiteCanonical(v, SITE_URL)) throw new ServiceError('validation', 'Canonical override must be a path or a URL on this site (prevents duplicate/off-site canonicals).');
}

export async function upsertEntitySeo(actor: Actor, entityType: LandingEntityType, entityId: string, raw: EntitySeoInput): Promise<EntitySeo> {
  requireEntityPerm(actor, entityType);
  await assertEntityExists(entityType, entityId);
  const v = Input.parse(raw);
  validateCanonicalOverride(v.canonicalOverride);
  const data = {
    seoTitle: v.seoTitle?.trim() || null,
    metaDescription: v.metaDescription?.trim() || null,
    canonicalOverride: v.canonicalOverride?.trim() || null,
    ogImage: v.ogImage?.trim() || null,
    noindex: v.noindex,
    intro: v.intro?.trim() || null,
    updatedById: actor.id,
  };
  const row = await prisma.entitySeo.upsert({
    where: { entityType_entityId: { entityType, entityId } },
    create: { entityType, entityId, ...data },
    update: data,
  });
  await audit(actor.id, 'entity.seo.upsert', 'entity_seo', `${entityType}:${entityId}`, v.noindex ? 'noindex' : 'index');
  return row;
}

/**
 * Merge editor SEO overrides onto a page's derived metadata, for `buildMetadata`.
 * Overrides fall back to derived values; `noindex` is additive-only (derived OR editor),
 * so an editor can never force-index a content-based-noindex page (Safeguard 2).
 *
 * Robots (Batch S3), combined most-restrictively:
 *   - editor `EntitySeo.noindex`  → noindex, FOLLOW (EDITOR_NOINDEX — must not block links)
 *   - content `derivedNoindex`    → noindex, nofollow (LEGACY_NOINDEX — unchanged route policy)
 *   - neither                     → index, follow
 */
export interface DerivedMeta {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: 'website' | 'article';
  derivedNoindex?: boolean;
}
export function mergeSeoMeta(seo: EntitySeo | null, d: DerivedMeta): Parameters<typeof buildMetadata>[0] {
  const canonical = resolveCanonical(seo?.canonicalOverride) ?? undefined;
  return {
    title: seo?.seoTitle?.trim() || d.title,
    description: seo?.metaDescription?.trim() || d.description,
    path: d.path,
    image: seo?.ogImage?.trim() || d.image,
    type: d.type,
    robots: combineRobots(
      d.derivedNoindex ? LEGACY_NOINDEX : INDEX_FOLLOW,
      seo?.noindex ? EDITOR_NOINDEX : INDEX_FOLLOW,
    ),
    canonical,
  };
}

/** Whether a landing entity is indexable: content-based eligibility AND not editor-noindex. */
export function isLandingIndexable(seo: EntitySeo | null, contentIndexable: boolean): boolean {
  return contentIndexable && !(seo?.noindex);
}

/** Internal cleanup — called from the owning entity's delete path to avoid orphans. */
export async function deleteEntitySeoForEntity(entityType: LandingEntityType, entityId: string): Promise<void> {
  await prisma.entitySeo.deleteMany({ where: { entityType, entityId } });
}
