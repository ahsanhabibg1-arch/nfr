import 'server-only';
import { z } from 'zod';
import { prisma } from '../db';
import type { Actor } from './guard';
import { audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';

const need = (a: Actor) => {
  if (!roleHasPermission(a.roles, 'system.config'))
    throw new ServiceError('forbidden', 'Not permitted (system.config).');
};

/**
 * Stage 06-R adds two keys. `SiteConfig` is keyed by a String primary key with
 * `draft`/`published` JSON columns, so a new key is a new ROW, never a schema
 * change — no Prisma migration is required for either, and existing rows are
 * untouched.
 *
 *   coverage  — the `/coverage/` archive's editorial copy and SEO (R-04).
 *   identity  — Site Identity & Branding: the authoritative logo source (R-06).
 *
 * `identity` is a key of its own rather than more fields on `appearance`
 * because `appearance` already owns the homepage Intro Banner. Branding is
 * consumed by the public header/footer, the admin chrome and the login pages —
 * a different lifetime, a different audience and a different blast radius from
 * one homepage module. Keeping them apart preserves single ownership per
 * concern, which is the property this programme has been restoring.
 */
export const SITE_CONFIG_KEYS = ['footer', 'appearance', 'coverage', 'identity'] as const;
export type SiteConfigKey = (typeof SITE_CONFIG_KEYS)[number];

/* ── Footer schema ─────────────────────────────────────────────────── */

export interface FooterConfig {
  tagline?: string;
  description?: string;
  copyright?: string;
  statusText?: string;
  socialLinks?: { platform: string; url: string }[];
  columns?: FooterColumn[];
}

export interface FooterColumn {
  title: string;
  links: { label: string; url: string; isExternal?: boolean }[];
}

const FooterLinkSchema = z.object({
  label: z.string().min(1).max(120),
  url: z.string().min(1).max(500),
  isExternal: z.boolean().optional(),
});

const FooterColumnSchema = z.object({
  title: z.string().min(1).max(120),
  links: z.array(FooterLinkSchema).max(20),
});

const SocialLinkSchema = z.object({
  platform: z.string().min(1).max(50),
  url: z.string().min(1).max(500),
});

const FooterConfigSchema = z.object({
  tagline: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  copyright: z.string().max(200).optional(),
  statusText: z.string().max(200).optional(),
  socialLinks: z.array(SocialLinkSchema).max(10).optional(),
  columns: z.array(FooterColumnSchema).max(6).optional(),
});

/* ── Appearance schema ─────────────────────────────────────────────── */

export type IntroBannerStyle =
  | 'editorial' | 'stadium' | 'bottom-caption' | 'right-focus' | 'glass'
  | 'framed' | 'split' | 'spotlight' | 'amber' | 'minimal';

export const INTRO_BANNER_STYLES: { id: IntroBannerStyle; label: string; description: string }[] = [
  { id: 'editorial', label: 'Editorial', description: 'Classic editorial hero with overlay text' },
  { id: 'stadium', label: 'Stadium', description: 'Full-bleed arena atmosphere with bold headline' },
  { id: 'bottom-caption', label: 'Bottom Caption', description: 'Image fills the frame, text at bottom edge' },
  { id: 'right-focus', label: 'Right Focus', description: 'Text left, image cropped right' },
  { id: 'glass', label: 'Glass', description: 'Frosted glass card overlaying the image' },
  { id: 'framed', label: 'Framed', description: 'Inset image with decorative border' },
  { id: 'split', label: 'Split', description: '50/50 text-image horizontal split' },
  { id: 'spotlight', label: 'Spotlight', description: 'Centered text with vignette' },
  { id: 'amber', label: 'Amber', description: 'NFRGuide gold accent treatment' },
  { id: 'minimal', label: 'Minimal', description: 'Clean type-forward hero, subtle image' },
];

export interface AppearanceConfig {
  introBannerStyle?: IntroBannerStyle;
  introBannerImageUrl?: string;
  introBannerEyebrow?: string;
  introBannerHeadline?: string;
  introBannerDescription?: string;
  introBannerCtaLabel?: string;
  introBannerCtaUrl?: string;
  introBannerCtaSecondaryLabel?: string;
  introBannerCtaSecondaryUrl?: string;
  introBannerFocalX?: number;
  introBannerFocalY?: number;
  introBannerMobileFocalX?: number;
  introBannerMobileFocalY?: number;
  introBannerZoom?: number;
  introBannerOverlayDarkness?: number;
  introBannerDesktopHeight?: string;
  introBannerMobileHeight?: string;
  introBannerTextAlign?: 'left' | 'center' | 'right';
  introBannerVerticalAlign?: 'top' | 'center' | 'bottom';
  introBannerFullWidth?: boolean;
  introBannerImageAlt?: string;
}

const AppearanceConfigSchema = z.object({
  introBannerStyle: z.enum(['editorial', 'stadium', 'bottom-caption', 'right-focus', 'glass', 'framed', 'split', 'spotlight', 'amber', 'minimal']).optional(),
  introBannerImageUrl: z.string().max(500).optional(),
  introBannerEyebrow: z.string().max(120).optional(),
  introBannerHeadline: z.string().max(200).optional(),
  introBannerDescription: z.string().max(500).optional(),
  introBannerCtaLabel: z.string().max(80).optional(),
  introBannerCtaUrl: z.string().max(500).optional(),
  introBannerCtaSecondaryLabel: z.string().max(80).optional(),
  introBannerCtaSecondaryUrl: z.string().max(500).optional(),
  introBannerFocalX: z.number().min(0).max(100).optional(),
  introBannerFocalY: z.number().min(0).max(100).optional(),
  introBannerMobileFocalX: z.number().min(0).max(100).optional(),
  introBannerMobileFocalY: z.number().min(0).max(100).optional(),
  introBannerZoom: z.number().min(100).max(200).optional(),
  introBannerOverlayDarkness: z.number().min(0).max(100).optional(),
  introBannerDesktopHeight: z.string().max(20).optional(),
  introBannerMobileHeight: z.string().max(20).optional(),
  introBannerTextAlign: z.enum(['left', 'center', 'right']).optional(),
  introBannerVerticalAlign: z.enum(['top', 'center', 'bottom']).optional(),
  introBannerFullWidth: z.boolean().optional(),
  introBannerImageAlt: z.string().max(300).optional(),
});

/* ── Coverage archive schema (R-04) ────────────────────────────────── */

export interface CoverageConfig {
  heading?: string;
  intro?: string;
  seoTitle?: string;
  metaDescription?: string;
  /** Editor kill switch for the archive's indexability. Default: indexable. */
  noindex?: boolean;
  /** Articles per page. Bounded so a stored value can never issue a huge query. */
  pageSize?: number;
}

const CoverageConfigSchema = z.object({
  heading: z.string().max(200).optional(),
  intro: z.string().max(1000).optional(),
  seoTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(400).optional(),
  noindex: z.boolean().optional(),
  pageSize: z.number().int().min(6).max(48).optional(),
});

/* ── Site Identity & Branding schema (R-06) ────────────────────────── */

export interface SiteIdentityConfig {
  /** Media Library delivery URL of the primary logo. Empty = wordmark fallback. */
  logoUrl?: string;
  /** Stable Media record id, so integrity can be checked and deletion guarded. */
  logoMediaId?: string;
  /** Accessible name. Empty string is NOT meaningful here — a logo is not decorative. */
  logoAlt?: string;
  /** Optional overrides. Each is an override of the primary logo, never a replacement system. */
  logoLightUrl?: string;
  logoLightMediaId?: string;
  logoDarkUrl?: string;
  logoDarkMediaId?: string;
  /** Max rendered height in px, so a tall logo cannot distort the header. */
  logoMaxHeight?: number;
}

/**
 * Only same-origin, path-absolute media URLs are accepted.
 *
 * Branding is rendered into the header of every page including the admin login,
 * so an arbitrary external URL here would be a stored SSRF/exfiltration vector
 * and a third-party dependency on a page that must always render. Media served
 * by this application starts `/api/media/` or `/media/`; nothing else is a
 * valid logo source. `javascript:`, `data:` and protocol-relative `//host` URLs
 * all fail this test by construction.
 */
const MediaUrlSchema = z
  .string()
  .max(500)
  .refine((v) => v === '' || (/^\/(api\/media|media)\/[A-Za-z0-9._\-/]+$/.test(v) && !v.split('/').includes('..')), {
    message: 'Logo must reference a Media Library file on this site (e.g. /api/media/...).',
  });

const SiteIdentityConfigSchema = z.object({
  logoUrl: MediaUrlSchema.optional(),
  logoMediaId: z.string().max(64).optional(),
  logoAlt: z.string().max(200).optional(),
  logoLightUrl: MediaUrlSchema.optional(),
  logoLightMediaId: z.string().max(64).optional(),
  logoDarkUrl: MediaUrlSchema.optional(),
  logoDarkMediaId: z.string().max(64).optional(),
  logoMaxHeight: z.number().int().min(16).max(160).optional(),
});

const SCHEMAS: Record<SiteConfigKey, z.ZodSchema> = {
  footer: FooterConfigSchema,
  appearance: AppearanceConfigSchema,
  coverage: CoverageConfigSchema,
  identity: SiteIdentityConfigSchema,
};

/* ── Generic config operations ─────────────────────────────────────── */

export async function getDraft<T>(key: SiteConfigKey): Promise<T> {
  const row = await prisma.siteConfig.findUnique({ where: { key } });
  if (!row) return {} as T;
  return row.draft as T;
}

export async function getPublished<T>(key: SiteConfigKey): Promise<T> {
  try {
    const row = await prisma.siteConfig.findUnique({ where: { key } });
    if (!row) return {} as T;
    return row.published as T;
  } catch {
    return {} as T;
  }
}

/**
 * Stage 06-R FC-05A — branding media references are proved against the Media
 * Library, and the delivery URL is DERIVED rather than trusted.
 *
 * The admin form posts a media id and a url together. Believing the url would
 * let a caller pair any id with any path — the id would look authoritative in
 * the stored record while something else was actually served. So for each logo
 * slot that carries an id, the asset is loaded and the url is REWRITTEN from
 * its `storageKey`. A mismatch is not an error to report; it simply cannot
 * survive, because the submitted value is discarded.
 *
 * The asset must also be one a public page may serve: PUBLIC, READY, a raster
 * image. SVG stays excluded — it is an executable document, and branding is
 * rendered on the admin login screen. A slot with a url but NO id is left
 * alone, so records written before this existed keep working (the same-origin
 * schema rule still applies to them).
 */
async function deriveBrandingMediaUrls(config: SiteIdentityConfig): Promise<SiteIdentityConfig> {
  const slots = [
    ['logoMediaId', 'logoUrl'],
    ['logoLightMediaId', 'logoLightUrl'],
    ['logoDarkMediaId', 'logoDarkUrl'],
  ] as const;

  const out: SiteIdentityConfig = { ...config };
  for (const [idKey, urlKey] of slots) {
    const mediaId = (out[idKey] ?? '').trim();
    if (!mediaId) continue;

    const asset = await prisma.mediaAsset.findUnique({
      where: { id: mediaId },
      select: { storageKey: true, mimeType: true, visibility: true, processingStatus: true },
    });
    if (!asset) throw new ServiceError('validation', `Logo media ${idKey} no longer exists in the Media Library.`);
    if (asset.visibility !== 'PUBLIC' || asset.processingStatus !== 'READY') {
      throw new ServiceError('validation', `Logo media ${idKey} is not a published, ready Media Library asset.`);
    }
    const mime = (asset.mimeType || '').toLowerCase();
    if (!mime.startsWith('image/') || mime.includes('svg')) {
      throw new ServiceError('validation', `Logo media ${idKey} must be a raster image (SVG is not permitted).`);
    }

    const derived = `/api/media/${asset.storageKey}`;
    // Re-apply the same-origin + traversal rule to the DERIVED value too: a
    // storage key is data, and data does not get to skip validation.
    const shapeOk =
      /^\/(api\/media|media)\/[A-Za-z0-9._\-/]+$/.test(derived) && !derived.split('/').includes('..');
    if (!shapeOk) throw new ServiceError('validation', `Logo media ${idKey} has an unusable storage key.`);

    out[urlKey] = derived;
  }
  return out;
}

export async function saveDraft(actor: Actor, key: SiteConfigKey, data: unknown): Promise<void> {
  need(actor);
  if (!SITE_CONFIG_KEYS.includes(key)) throw new ServiceError('validation', `Unknown config key: "${key}".`);
  const schema = SCHEMAS[key];
  let validated = schema.parse(data);
  if (key === 'identity') validated = await deriveBrandingMediaUrls(validated as SiteIdentityConfig);

  await prisma.siteConfig.upsert({
    where: { key },
    create: { key, draft: JSON.parse(JSON.stringify(validated)), updatedById: actor.id },
    update: { draft: JSON.parse(JSON.stringify(validated)), updatedById: actor.id },
  });
  await audit(actor.id, `site_config.draft_save`, 'SiteConfig', key, key);
}

export async function publishConfig(actor: Actor, key: SiteConfigKey): Promise<void> {
  need(actor);
  const row = await prisma.siteConfig.findUnique({ where: { key } });
  if (!row) throw new ServiceError('not_found', `No config found for "${key}".`);

  await prisma.siteConfig.update({
    where: { key },
    data: {
      published: JSON.parse(JSON.stringify(row.draft)),
      publishedAt: new Date(),
      publishedById: actor.id,
      updatedById: actor.id,
      version: { increment: 1 },
    },
  });
  await audit(actor.id, `site_config.publish`, 'SiteConfig', key, key);
}

export async function resetDraftToPublished(actor: Actor, key: SiteConfigKey): Promise<void> {
  need(actor);
  const row = await prisma.siteConfig.findUnique({ where: { key } });
  if (!row) throw new ServiceError('not_found', `No config found for "${key}".`);

  await prisma.siteConfig.update({
    where: { key },
    data: { draft: JSON.parse(JSON.stringify(row.published)), updatedById: actor.id },
  });
  await audit(actor.id, `site_config.reset_draft`, 'SiteConfig', key, key);
}

export interface SiteConfigRow {
  key: string;
  draft: unknown;
  published: unknown;
  publishedAt: string | null;
  version: number;
}

export async function listSiteConfigs(): Promise<SiteConfigRow[]> {
  const rows = await prisma.siteConfig.findMany({ orderBy: { key: 'asc' } });
  return rows.map((r) => ({
    key: r.key,
    draft: r.draft,
    published: r.published,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    version: r.version,
  }));
}
