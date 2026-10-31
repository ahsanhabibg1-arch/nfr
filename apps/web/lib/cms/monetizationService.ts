import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission } from '../auth/rbac';
import { ServiceError } from './articleService';
import { validateCommercialUrl } from '../monetization/url';
import {
  getMonetizationSettings,
  DEFAULT_MONETIZATION_SETTINGS,
  MONETIZATION_CONFIG_KEY,
  type MonetizationSettings,
} from '../monetization/config';

/**
 * Monetization & Affiliate service (Batch 08). Default-deny RBAC + audit on every
 * mutation. Commercial data is kept separate from editorial facts: a partner is not
 * an official source, and a placement is not an endorsement. No revenue/commission/
 * approval/availability/price is ever fabricated. Reference-safe deletion. URLs are
 * validated server-side. See MONETIZATION_ARCHITECTURE.md / MONETIZATION_RBAC_MATRIX.md.
 */
const P = {
  view: 'monetization.view',
  partner: 'monetization.partner.manage',
  link: 'monetization.link.manage',
  placement: 'monetization.placement.manage',
  disclosure: 'monetization.disclosure.manage',
  config: 'monetization.config',
  report: 'monetization.report.view',
} as const;

const need = (a: Actor, p: Parameters<typeof roleHasPermission>[1]) => {
  if (!roleHasPermission(a.roles, p)) throw new ServiceError('forbidden', `Not permitted (${p}).`);
};

async function assertCanEditArticle(actor: Actor, articleId: string): Promise<void> {
  if (roleHasPermission(actor.roles, 'article.edit.any')) return;
  if (roleHasPermission(actor.roles, 'article.edit.own')) {
    const a = await prisma.article.findUnique({ where: { id: articleId }, select: { createdById: true } });
    if (a && a.createdById === actor.id) return;
  }
  throw new ServiceError('forbidden', 'You cannot edit monetization for this article.');
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || `partner-${Date.now()}`;
}

const category = z.enum(['STREAMING', 'TICKETS', 'TRAVEL', 'APPAREL', 'BOOTS', 'ACCESSORIES', 'EQUIPMENT', 'OTHER']);
const relAttr = z.enum(['SPONSORED', 'NOFOLLOW', 'SPONSORED_NOFOLLOW', 'UGC']);
const verification = z.enum(['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED']);
const entityType = z.enum(['ARTICLE', 'RODEO_HUB', 'RODEO_EVENT', 'RODEO_EDITION', 'DISCIPLINE', 'CATEGORY']);
const adSlot = z.enum(['HOMEPAGE', 'ARTICLE_HEADER', 'ARTICLE_INCONTENT', 'ARTICLE_FOOTER', 'CATEGORY', 'RODEO_EVENT', 'SIDEBAR']);

// ============================ PARTNERS ============================
const PartnerInput = z.object({
  name: z.string().min(1).max(200),
  website: z.string().max(500).optional().nullable(),
  category,
  programType: z.string().max(120).optional().nullable(),
  complianceNotes: z.string().max(2000).optional().nullable(),
});
export type PartnerInput = z.input<typeof PartnerInput>;

export async function listPartners(actor: Actor) {
  need(actor, P.view);
  return prisma.affiliatePartner.findMany({
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { links: true, associations: true } } },
  });
}

export async function createPartner(actor: Actor, raw: PartnerInput) {
  need(actor, P.partner);
  const v = PartnerInput.parse(raw);
  if (v.website) {
    const c = validateCommercialUrl(v.website);
    if (!c.ok) throw new ServiceError('validation', `Partner website invalid: ${c.reason}`);
  }
  let slug = slugify(v.name);
  if (await prisma.affiliatePartner.findUnique({ where: { slug }, select: { id: true } })) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const partner = await prisma.affiliatePartner.create({
    data: {
      name: v.name, slug, website: v.website ?? null, category: v.category,
      programType: v.programType ?? null, complianceNotes: v.complianceNotes ?? null,
      verificationStatus: 'UNVERIFIED', isActive: false, createdById: actor.id,
    },
  });
  await audit(actor.id, 'monetization.partner.create', 'affiliate_partner', partner.id, v.name);
  return partner;
}

export async function updatePartner(actor: Actor, id: string, raw: PartnerInput) {
  need(actor, P.partner);
  const v = PartnerInput.parse(raw);
  if (v.website) {
    const c = validateCommercialUrl(v.website);
    if (!c.ok) throw new ServiceError('validation', `Partner website invalid: ${c.reason}`);
  }
  if (!(await prisma.affiliatePartner.findUnique({ where: { id }, select: { id: true } }))) throw new ServiceError('not_found', 'Partner not found');
  const partner = await prisma.affiliatePartner.update({
    where: { id },
    data: { name: v.name, website: v.website ?? null, category: v.category, programType: v.programType ?? null, complianceNotes: v.complianceNotes ?? null },
  });
  await audit(actor.id, 'monetization.partner.update', 'affiliate_partner', id);
  return partner;
}

export async function setPartnerActive(actor: Actor, id: string, active: boolean) {
  need(actor, P.partner);
  const p = await prisma.affiliatePartner.findUnique({ where: { id }, select: { verificationStatus: true } });
  if (!p) throw new ServiceError('not_found', 'Partner not found');
  // Guard against claiming an unverified partner is live/official.
  if (active && p.verificationStatus !== 'VERIFIED') throw new ServiceError('conflict', 'Partner must be VERIFIED before activation.');
  await prisma.affiliatePartner.update({ where: { id }, data: { isActive: active } });
  await audit(actor.id, 'monetization.partner.active', 'affiliate_partner', id, active ? 'activated' : 'deactivated');
}

export async function setPartnerVerification(actor: Actor, id: string, status: z.infer<typeof verification>, note?: string) {
  need(actor, P.partner);
  const v = verification.parse(status);
  if (!(await prisma.affiliatePartner.findUnique({ where: { id }, select: { id: true } }))) throw new ServiceError('not_found', 'Partner not found');
  await prisma.affiliatePartner.update({
    where: { id },
    data: {
      verificationStatus: v,
      verifiedAt: v === 'VERIFIED' ? new Date() : null,
      lastVerifiedAt: new Date(),
      ...(note !== undefined ? { complianceNotes: note } : {}),
      ...(v !== 'VERIFIED' ? { isActive: false } : {}), // de-verifying also deactivates
    },
  });
  await audit(actor.id, 'monetization.partner.verify', 'affiliate_partner', id, v);
}

export async function deletePartner(actor: Actor, id: string) {
  need(actor, P.partner);
  const links = await prisma.affiliateLink.count({ where: { partnerId: id } });
  if (links > 0) throw new ServiceError('conflict', `Partner has ${links} link(s); deactivate or remove them first.`);
  const partner = await prisma.affiliatePartner.findUnique({ where: { id }, select: { id: true } });
  if (!partner) throw new ServiceError('not_found', 'Partner not found');
  await prisma.affiliatePartner.delete({ where: { id } }); // cascades programs/associations
  await audit(actor.id, 'monetization.partner.delete', 'affiliate_partner', id);
}

// ============================ LINKS ============================
const LinkInput = z.object({
  partnerId: z.string().min(1),
  label: z.string().min(1).max(200),
  merchantUrl: z.string().min(1).max(1000),
  trackingUrl: z.string().max(1000).optional().nullable(),
  category,
  rel: relAttr.default('SPONSORED_NOFOLLOW'),
  editorialContext: z.string().max(1000).optional().nullable(),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
  verificationNotes: z.string().max(1000).optional().nullable(),
});
export type LinkInput = z.input<typeof LinkInput>;

function validUrls(merchantUrl: string, trackingUrl?: string | null): void {
  const m = validateCommercialUrl(merchantUrl);
  if (!m.ok) throw new ServiceError('validation', `Merchant URL rejected: ${m.reason}`);
  if (trackingUrl) {
    const t = validateCommercialUrl(trackingUrl);
    if (!t.ok) throw new ServiceError('validation', `Tracking URL rejected: ${t.reason}`);
  }
}

export async function listLinks(actor: Actor, params: { partnerId?: string } = {}) {
  need(actor, P.view);
  return prisma.affiliateLink.findMany({
    where: { ...(params.partnerId ? { partnerId: params.partnerId } : {}) },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    include: { partner: { select: { name: true, isActive: true } }, _count: { select: { placements: true } } },
  });
}

export async function createLink(actor: Actor, raw: LinkInput) {
  need(actor, P.link);
  const v = LinkInput.parse(raw);
  validUrls(v.merchantUrl, v.trackingUrl);
  if (!(await prisma.affiliatePartner.findUnique({ where: { id: v.partnerId }, select: { id: true } }))) throw new ServiceError('not_found', 'Partner not found');
  const link = await prisma.affiliateLink.create({
    data: {
      partnerId: v.partnerId, label: v.label, merchantUrl: validateCommercialUrl(v.merchantUrl).normalized!,
      trackingUrl: v.trackingUrl ? validateCommercialUrl(v.trackingUrl).normalized! : null,
      category: v.category, rel: v.rel, editorialContext: v.editorialContext ?? null,
      effectiveFrom: v.effectiveFrom ? new Date(v.effectiveFrom) : null,
      effectiveTo: v.effectiveTo ? new Date(v.effectiveTo) : null,
      verificationNotes: v.verificationNotes ?? null, status: 'DRAFT', isActive: false, createdById: actor.id,
    },
  });
  await audit(actor.id, 'monetization.link.create', 'affiliate_link', link.id, v.label);
  return link;
}

export async function updateLink(actor: Actor, id: string, raw: LinkInput) {
  need(actor, P.link);
  const v = LinkInput.parse(raw);
  validUrls(v.merchantUrl, v.trackingUrl);
  if (!(await prisma.affiliateLink.findUnique({ where: { id }, select: { id: true } }))) throw new ServiceError('not_found', 'Link not found');
  const link = await prisma.affiliateLink.update({
    where: { id },
    data: {
      partnerId: v.partnerId, label: v.label, merchantUrl: validateCommercialUrl(v.merchantUrl).normalized!,
      trackingUrl: v.trackingUrl ? validateCommercialUrl(v.trackingUrl).normalized! : null,
      category: v.category, rel: v.rel, editorialContext: v.editorialContext ?? null,
      effectiveFrom: v.effectiveFrom ? new Date(v.effectiveFrom) : null,
      effectiveTo: v.effectiveTo ? new Date(v.effectiveTo) : null,
      verificationNotes: v.verificationNotes ?? null,
    },
  });
  await audit(actor.id, 'monetization.link.update', 'affiliate_link', id);
  return link;
}

export async function setLinkActive(actor: Actor, id: string, active: boolean) {
  need(actor, P.link);
  const link = await prisma.affiliateLink.findUnique({ where: { id }, select: { partner: { select: { isActive: true } } } });
  if (!link) throw new ServiceError('not_found', 'Link not found');
  if (active && !link.partner.isActive) throw new ServiceError('conflict', 'Partner must be active before activating a link.');
  await prisma.affiliateLink.update({ where: { id }, data: { isActive: active, status: active ? 'ACTIVE' : 'INACTIVE' } });
  await audit(actor.id, 'monetization.link.active', 'affiliate_link', id, active ? 'activated' : 'deactivated');
}

export async function deleteLink(actor: Actor, id: string) {
  need(actor, P.link);
  const placements = await prisma.affiliatePlacement.count({ where: { linkId: id } });
  if (placements > 0) throw new ServiceError('conflict', `Link has ${placements} placement(s); remove them first.`);
  if (!(await prisma.affiliateLink.findUnique({ where: { id }, select: { id: true } }))) throw new ServiceError('not_found', 'Link not found');
  await prisma.affiliateLink.delete({ where: { id } });
  await audit(actor.id, 'monetization.link.delete', 'affiliate_link', id);
}

// ============================ PLACEMENTS (article/rodeo) ============================
const PlacementInput = z.object({
  linkId: z.string().min(1),
  entityType: entityType.default('ARTICLE'),
  entityId: z.string().min(1),
  position: z.string().max(60).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});
export type PlacementInput = z.input<typeof PlacementInput>;

export async function listArticlePlacements(actor: Actor, articleId: string) {
  need(actor, P.view);
  return prisma.affiliatePlacement.findMany({
    where: { articleId },
    orderBy: { createdAt: 'asc' },
    include: { link: { select: { label: true, category: true, rel: true, isActive: true, partner: { select: { name: true } } } } },
  });
}

/** Editors (any article) / Authors (own) propose a placement via article-edit rights. */
export async function createArticlePlacement(actor: Actor, raw: PlacementInput) {
  need(actor, P.view);
  const v = PlacementInput.parse(raw);
  if (v.entityType === 'ARTICLE') await assertCanEditArticle(actor, v.entityId);
  else need(actor, P.placement); // non-article entity placements are an admin operation
  if (!(await prisma.affiliateLink.findUnique({ where: { id: v.linkId }, select: { id: true } }))) throw new ServiceError('not_found', 'Link not found');
  const placement = await prisma.affiliatePlacement.create({
    data: {
      linkId: v.linkId, entityType: v.entityType, entityId: v.entityId,
      articleId: v.entityType === 'ARTICLE' ? v.entityId : null,
      position: v.position ?? null, note: v.note ?? null, proposedById: actor.id, status: 'DRAFT', isActive: false,
    },
  });
  await audit(actor.id, 'monetization.placement.create', 'affiliate_placement', placement.id);
  return placement;
}

/** Activation is always an admin-level monetization operation (not article-edit). */
export async function setPlacementActive(actor: Actor, id: string, active: boolean) {
  need(actor, P.placement);
  const pl = await prisma.affiliatePlacement.findUnique({ where: { id }, select: { link: { select: { isActive: true } } } });
  if (!pl) throw new ServiceError('not_found', 'Placement not found');
  if (active && !pl.link.isActive) throw new ServiceError('conflict', 'Underlying link must be active first.');
  await prisma.affiliatePlacement.update({ where: { id }, data: { isActive: active, status: active ? 'ACTIVE' : 'INACTIVE', approvedById: active ? actor.id : null } });
  await audit(actor.id, 'monetization.placement.active', 'affiliate_placement', id, active ? 'activated' : 'deactivated');
}

export async function deletePlacement(actor: Actor, id: string) {
  const pl = await prisma.affiliatePlacement.findUnique({ where: { id }, select: { articleId: true, entityType: true } });
  if (!pl) throw new ServiceError('not_found', 'Placement not found');
  if (pl.entityType === 'ARTICLE' && pl.articleId) await assertCanEditArticle(actor, pl.articleId);
  else need(actor, P.placement);
  await prisma.affiliatePlacement.delete({ where: { id } });
  await audit(actor.id, 'monetization.placement.delete', 'affiliate_placement', id);
}

// ============================ COMMERCIAL ASSOCIATIONS (rodeo) ============================
const AssociationInput = z.object({
  partnerId: z.string().min(1),
  entityType,
  entityId: z.string().min(1),
  relationshipType: z.string().min(1).max(60),
  note: z.string().max(500).optional().nullable(),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
});
export type AssociationInput = z.input<typeof AssociationInput>;

export async function listAssociations(actor: Actor, params: { entityType?: string; entityId?: string } = {}) {
  need(actor, P.view);
  return prisma.commercialEntityAssociation.findMany({
    where: { ...(params.entityType ? { entityType: params.entityType as never } : {}), ...(params.entityId ? { entityId: params.entityId } : {}) },
    orderBy: { createdAt: 'desc' },
    include: { partner: { select: { name: true, isActive: true } } },
  });
}

export async function createAssociation(actor: Actor, raw: AssociationInput) {
  need(actor, P.placement);
  const v = AssociationInput.parse(raw);
  if (!(await prisma.affiliatePartner.findUnique({ where: { id: v.partnerId }, select: { id: true } }))) throw new ServiceError('not_found', 'Partner not found');
  const a = await prisma.commercialEntityAssociation.create({
    data: {
      partnerId: v.partnerId, entityType: v.entityType, entityId: v.entityId, relationshipType: v.relationshipType,
      note: v.note ?? null, effectiveFrom: v.effectiveFrom ? new Date(v.effectiveFrom) : null, effectiveTo: v.effectiveTo ? new Date(v.effectiveTo) : null,
      status: 'DRAFT', isActive: false, createdById: actor.id,
    },
  });
  await audit(actor.id, 'monetization.association.create', 'commercial_association', a.id, `${v.entityType}:${v.relationshipType}`);
  return a;
}

export async function setAssociationActive(actor: Actor, id: string, active: boolean) {
  need(actor, P.placement);
  if (!(await prisma.commercialEntityAssociation.findUnique({ where: { id }, select: { id: true } }))) throw new ServiceError('not_found', 'Association not found');
  await prisma.commercialEntityAssociation.update({ where: { id }, data: { isActive: active, status: active ? 'ACTIVE' : 'INACTIVE' } });
  await audit(actor.id, 'monetization.association.active', 'commercial_association', id, active ? 'activated' : 'deactivated');
}

export async function deleteAssociation(actor: Actor, id: string) {
  need(actor, P.placement);
  if (!(await prisma.commercialEntityAssociation.findUnique({ where: { id }, select: { id: true } }))) throw new ServiceError('not_found', 'Association not found');
  await prisma.commercialEntityAssociation.delete({ where: { id } });
  await audit(actor.id, 'monetization.association.delete', 'commercial_association', id);
}

// ============================ AD PLACEMENTS ============================
const AdInput = z.object({
  slot: adSlot,
  name: z.string().min(1).max(200),
  pageScope: z.enum(['home', 'article', 'category', 'rodeo_event', 'global']).default('global'),
  device: z.enum(['all', 'desktop', 'mobile']).default('all'),
  position: z.number().int().min(0).max(100).default(0),
  priority: z.number().int().min(0).max(100).default(0),
  responsive: z.boolean().default(true),
  complianceNotes: z.string().max(1000).optional().nullable(),
});
export type AdInput = z.input<typeof AdInput>;

export async function listAdPlacements(actor: Actor) {
  need(actor, P.view);
  return prisma.adPlacement.findMany({ orderBy: [{ pageScope: 'asc' }, { priority: 'desc' }] });
}

export async function createAdPlacement(actor: Actor, raw: AdInput) {
  need(actor, P.placement);
  const v = AdInput.parse(raw);
  const ad = await prisma.adPlacement.create({
    data: { slot: v.slot, name: v.name, pageScope: v.pageScope, device: v.device, position: v.position, priority: v.priority, responsive: v.responsive, complianceNotes: v.complianceNotes ?? null, enabled: false, createdById: actor.id },
  });
  await audit(actor.id, 'monetization.ad.create', 'ad_placement', ad.id, v.slot);
  return ad;
}

export async function setAdPlacementEnabled(actor: Actor, id: string, enabled: boolean) {
  need(actor, P.placement);
  if (!(await prisma.adPlacement.findUnique({ where: { id }, select: { id: true } }))) throw new ServiceError('not_found', 'Ad placement not found');
  await prisma.adPlacement.update({ where: { id }, data: { enabled } });
  await audit(actor.id, 'monetization.ad.enabled', 'ad_placement', id, enabled ? 'enabled' : 'disabled');
}

export async function deleteAdPlacement(actor: Actor, id: string) {
  need(actor, P.placement);
  if (!(await prisma.adPlacement.findUnique({ where: { id }, select: { id: true } }))) throw new ServiceError('not_found', 'Ad placement not found');
  await prisma.adPlacement.delete({ where: { id } });
  await audit(actor.id, 'monetization.ad.delete', 'ad_placement', id);
}

// ============================ DISCLOSURES ============================
const DisclosureInput = z.object({
  key: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/),
  scope: z.enum(['site', 'article', 'callout', 'sponsored', 'ad', 'partner']),
  label: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  requiredProminent: z.boolean().default(true),
  enabled: z.boolean().default(true),
  partnerId: z.string().optional().nullable(),
});
export type DisclosureInput = z.input<typeof DisclosureInput>;

export async function listDisclosures(actor: Actor) {
  need(actor, P.view);
  return prisma.monetizationDisclosure.findMany({ orderBy: { scope: 'asc' } });
}

export async function upsertDisclosure(actor: Actor, raw: DisclosureInput) {
  need(actor, P.disclosure);
  const v = DisclosureInput.parse(raw);
  const d = await prisma.monetizationDisclosure.upsert({
    where: { key: v.key },
    create: { key: v.key, scope: v.scope, label: v.label, body: v.body, requiredProminent: v.requiredProminent, enabled: v.enabled, partnerId: v.partnerId ?? null, updatedById: actor.id },
    update: { scope: v.scope, label: v.label, body: v.body, requiredProminent: v.requiredProminent, enabled: v.enabled, partnerId: v.partnerId ?? null, updatedById: actor.id },
  });
  await audit(actor.id, 'monetization.disclosure.upsert', 'monetization_disclosure', v.key);
  return d;
}

// ============================ SPONSORED CONTENT ============================
const SponsoredInput = z.object({
  articleId: z.string().min(1),
  partnerId: z.string().optional().nullable(),
  sponsorName: z.string().min(1).max(200),
  disclosureLabel: z.string().max(80).default('Sponsored'),
  rel: relAttr.default('SPONSORED'),
  startAt: z.string().datetime().optional().nullable(),
  endAt: z.string().datetime().optional().nullable(),
  reviewNotes: z.string().max(1000).optional().nullable(),
});
export type SponsoredInput = z.input<typeof SponsoredInput>;

export async function listSponsored(actor: Actor) {
  need(actor, P.view);
  return prisma.sponsoredContentRelationship.findMany({
    orderBy: { createdAt: 'desc' },
    include: { article: { select: { title: true, slug: true } }, partner: { select: { name: true } } },
  });
}

export async function createSponsored(actor: Actor, raw: SponsoredInput) {
  need(actor, P.disclosure);
  const v = SponsoredInput.parse(raw);
  if (!(await prisma.article.findUnique({ where: { id: v.articleId }, select: { id: true } }))) throw new ServiceError('not_found', 'Article not found');
  const s = await prisma.sponsoredContentRelationship.create({
    data: {
      articleId: v.articleId, partnerId: v.partnerId ?? null, sponsorName: v.sponsorName, disclosureLabel: v.disclosureLabel, rel: v.rel,
      startAt: v.startAt ? new Date(v.startAt) : null, endAt: v.endAt ? new Date(v.endAt) : null, reviewNotes: v.reviewNotes ?? null,
      status: 'DRAFT', isActive: false, createdById: actor.id,
    },
  });
  await audit(actor.id, 'monetization.sponsored.create', 'sponsored_content', s.id, v.sponsorName);
  return s;
}

export async function setSponsoredActive(actor: Actor, id: string, active: boolean) {
  need(actor, P.disclosure);
  if (!(await prisma.sponsoredContentRelationship.findUnique({ where: { id }, select: { id: true } }))) throw new ServiceError('not_found', 'Sponsorship not found');
  await prisma.sponsoredContentRelationship.update({ where: { id }, data: { isActive: active, status: active ? 'ACTIVE' : 'INACTIVE' } });
  await audit(actor.id, 'monetization.sponsored.active', 'sponsored_content', id, active ? 'activated' : 'deactivated');
}

export async function deleteSponsored(actor: Actor, id: string) {
  need(actor, P.disclosure);
  if (!(await prisma.sponsoredContentRelationship.findUnique({ where: { id }, select: { id: true } }))) throw new ServiceError('not_found', 'Sponsorship not found');
  await prisma.sponsoredContentRelationship.delete({ where: { id } });
  await audit(actor.id, 'monetization.sponsored.delete', 'sponsored_content', id);
}

// ============================ CONFIG ============================
export async function getMonetizationConfig(actor: Actor): Promise<MonetizationSettings> {
  need(actor, P.view);
  return getMonetizationSettings();
}

const ConfigInput = z.object({
  adsenseEnabled: z.boolean(),
  adsensePublisherId: z.string().max(64).nullable().optional(),
  clickTrackingEnabled: z.boolean(),
  siteDisclosureEnabled: z.boolean(),
});
export type ConfigInput = z.input<typeof ConfigInput>;

export async function updateMonetizationConfig(actor: Actor, raw: ConfigInput): Promise<MonetizationSettings> {
  need(actor, P.config);
  const v = ConfigInput.parse(raw);
  const value: MonetizationSettings = {
    ...DEFAULT_MONETIZATION_SETTINGS,
    adsenseEnabled: v.adsenseEnabled,
    adsensePublisherId: v.adsensePublisherId ?? null,
    clickTrackingEnabled: v.clickTrackingEnabled,
    siteDisclosureEnabled: v.siteDisclosureEnabled,
  };
  await prisma.monetizationConfiguration.upsert({
    where: { key: MONETIZATION_CONFIG_KEY },
    create: { key: MONETIZATION_CONFIG_KEY, value: value as unknown as Prisma.InputJsonObject, updatedById: actor.id },
    update: { value: value as unknown as Prisma.InputJsonObject, updatedById: actor.id },
  });
  await audit(actor.id, 'monetization.config.update', 'monetization_config', MONETIZATION_CONFIG_KEY, `adsense=${v.adsenseEnabled} clicks=${v.clickTrackingEnabled}`);
  return value;
}

// ============================ DASHBOARD ============================
export interface MonetizationDashboard {
  settings: MonetizationSettings;
  partners: { total: number; active: number; pendingVerification: number };
  links: { total: number; active: number; inactive: number };
  placements: { total: number; active: number };
  adPlacements: { total: number; enabled: number };
  sponsored: { total: number; active: number };
  disclosures: { total: number };
  clicks: { trackingEnabled: boolean; last30d: number | null };
  readiness: { label: string; ok: boolean }[];
}

export async function getMonetizationDashboard(actor: Actor): Promise<MonetizationDashboard> {
  need(actor, P.view);
  const settings = await getMonetizationSettings();
  const [pTotal, pActive, pPending, lTotal, lActive, plTotal, plActive, adTotal, adEnabled, spTotal, spActive, dTotal] = await Promise.all([
    prisma.affiliatePartner.count(),
    prisma.affiliatePartner.count({ where: { isActive: true } }),
    prisma.affiliatePartner.count({ where: { verificationStatus: { in: ['UNVERIFIED', 'PENDING'] } } }),
    prisma.affiliateLink.count(),
    prisma.affiliateLink.count({ where: { isActive: true } }),
    prisma.affiliatePlacement.count(),
    prisma.affiliatePlacement.count({ where: { isActive: true } }),
    prisma.adPlacement.count(),
    prisma.adPlacement.count({ where: { enabled: true } }),
    prisma.sponsoredContentRelationship.count(),
    prisma.sponsoredContentRelationship.count({ where: { isActive: true } }),
    prisma.monetizationDisclosure.count(),
  ]);

  // Outbound clicks are only meaningful when tracking is enabled AND data exists.
  let last30d: number | null = null;
  if (settings.clickTrackingEnabled) {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const agg = await prisma.affiliateClickAggregate.aggregate({ _sum: { count: true }, where: { day: { gte: since } } });
    last30d = agg._sum.count ?? 0;
  }

  return {
    settings,
    partners: { total: pTotal, active: pActive, pendingVerification: pPending },
    links: { total: lTotal, active: lActive, inactive: lTotal - lActive },
    placements: { total: plTotal, active: plActive },
    adPlacements: { total: adTotal, enabled: adEnabled },
    sponsored: { total: spTotal, active: spActive },
    disclosures: { total: dTotal },
    clicks: { trackingEnabled: settings.clickTrackingEnabled, last30d },
    readiness: [
      { label: 'Affiliate disclosure configured', ok: dTotal > 0 },
      { label: 'At least one verified active partner', ok: pActive > 0 },
      { label: 'AdSense publisher id set (when enabling ads)', ok: !!settings.adsensePublisherId },
      { label: 'External ad serving', ok: settings.adsenseEnabled },
      { label: 'Outbound click tracking', ok: settings.clickTrackingEnabled },
    ],
  };
}

// ============================ COMMERCIAL COMPLIANCE (advisory, §20) ============================
export interface ComplianceFinding {
  code: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  entity: string;
}

/** Advisory, read-only commercial-compliance checks — distinct from the Batch 06 SEO
 * rules (which are unchanged). Never fabricated; derived from real DB state. */
export async function getCommercialCompliance(actor: Actor): Promise<ComplianceFinding[]> {
  need(actor, P.report);
  const now = new Date();
  const findings: ComplianceFinding[] = [];

  const [activeLinksNoDisclosure, expiredActive, placementsOnUnpublished, badDest, unverifiedActive] = await Promise.all([
    // active affiliate placements but no enabled article-affiliate disclosure policy
    prisma.monetizationDisclosure.count({ where: { key: 'article-affiliate', enabled: true } }),
    prisma.affiliateLink.findMany({ where: { isActive: true, effectiveTo: { lt: now } }, select: { id: true, label: true }, take: 50 }),
    prisma.affiliatePlacement.findMany({
      where: { isActive: true, articleId: { not: null }, article: { workflowStatus: { not: 'PUBLISHED' } } },
      select: { id: true, article: { select: { title: true } } }, take: 50,
    }),
    prisma.affiliateLink.findMany({ where: { isActive: true }, select: { id: true, label: true, merchantUrl: true, trackingUrl: true }, take: 500 }),
    prisma.affiliateLink.findMany({ where: { isActive: true, partner: { verificationStatus: { not: 'VERIFIED' } } }, select: { id: true, label: true }, take: 50 }),
  ]);

  const activePlacementCount = await prisma.affiliatePlacement.count({ where: { isActive: true } });
  if (activePlacementCount > 0 && activeLinksNoDisclosure === 0) {
    findings.push({ code: 'missing-affiliate-disclosure', severity: 'high', message: 'Active affiliate placements exist but no enabled "article-affiliate" disclosure policy is configured.', entity: 'disclosure:article-affiliate' });
  }
  for (const l of expiredActive) findings.push({ code: 'expired-offer-active', severity: 'high', message: `Link "${l.label}" is active but its effective window has ended.`, entity: `link:${l.id}` });
  for (const p of placementsOnUnpublished) findings.push({ code: 'commercial-on-unpublished', severity: 'medium', message: `Active commercial placement on unpublished article "${p.article?.title ?? ''}".`, entity: `placement:${p.id}` });
  for (const l of badDest) {
    const dest = (l.trackingUrl && l.trackingUrl.trim()) || l.merchantUrl;
    if (!validateCommercialUrl(dest).ok) findings.push({ code: 'invalid-destination', severity: 'high', message: `Link "${l.label}" has an invalid/unsafe destination.`, entity: `link:${l.id}` });
  }
  for (const l of unverifiedActive) findings.push({ code: 'unverified-partner-active', severity: 'medium', message: `Active link "${l.label}" belongs to a partner that is not VERIFIED.`, entity: `link:${l.id}` });

  return findings;
}

export type { MonetizationSettings } from '../monetization/config';
