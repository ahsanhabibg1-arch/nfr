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

export const SITE_CONFIG_KEYS = ['footer', 'appearance'] as const;
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

const SCHEMAS: Record<SiteConfigKey, z.ZodSchema> = {
  footer: FooterConfigSchema,
  appearance: AppearanceConfigSchema,
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

export async function saveDraft(actor: Actor, key: SiteConfigKey, data: unknown): Promise<void> {
  need(actor);
  if (!SITE_CONFIG_KEYS.includes(key)) throw new ServiceError('validation', `Unknown config key: "${key}".`);
  const schema = SCHEMAS[key];
  const validated = schema.parse(data);

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
