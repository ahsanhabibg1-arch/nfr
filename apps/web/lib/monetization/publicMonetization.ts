import 'server-only';
import type { AffiliateRelAttribute } from '@prisma/client';
import { prisma } from '../db';
import { relString } from './rel';
import { validateCommercialUrl } from './url';
import { getMonetizationSettings } from './config';

/**
 * Public (read-only) monetization helpers (Batch 08 §8/§11/§23). Only ACTIVE,
 * in-effect, approved commercial items for PUBLISHED content are ever exposed, with
 * the destination re-validated and the correct paid-link `rel` applied. No private
 * CMS data leaks. External ad serving stays OFF unless owner-enabled.
 */

/** A link is "live" when it + its partner are active and within any effective dates. */
function liveWhere() {
  const now = new Date();
  return {
    isActive: true,
    partner: { isActive: true },
    AND: [
      { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
      { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
    ],
  };
}

export interface ResolvedDestination {
  destination: string;
  rel: AffiliateRelAttribute;
}

/** Resolve a link id to a validated destination — or null when not live/invalid.
 * Destination comes ONLY from the DB (never user input), so the /go redirect cannot
 * be an open redirect. */
export async function resolveActiveAffiliateLink(id: string): Promise<ResolvedDestination | null> {
  if (!id) return null;
  const link = await prisma.affiliateLink.findFirst({
    where: { id, ...liveWhere() },
    select: { trackingUrl: true, merchantUrl: true, rel: true },
  });
  if (!link) return null;
  const dest = (link.trackingUrl && link.trackingUrl.trim()) || link.merchantUrl;
  const check = validateCommercialUrl(dest);
  if (!check.ok || !check.normalized) return null; // safe fallback — never redirect to an invalid dest
  return { destination: check.normalized, rel: link.rel };
}

export interface PublicOffer {
  placementId: string;
  linkId: string;
  label: string;
  href: string; // first-party /go/<id> redirect
  rel: string; // resolved rel attribute string
  category: string;
  context: string | null;
}

export interface ArticleMonetization {
  offers: PublicOffer[];
  sponsored: { sponsorName: string; disclosureLabel: string } | null;
  showAffiliateDisclosure: boolean;
  disclosureBody: string | null;
}

export async function getArticleMonetization(articleId: string): Promise<ArticleMonetization> {
  const [placements, sponsorship, disclosure] = await Promise.all([
    prisma.affiliatePlacement.findMany({
      where: { articleId, isActive: true, link: liveWhere() },
      select: { id: true, position: true, link: { select: { id: true, label: true, rel: true, category: true, editorialContext: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.sponsoredContentRelationship.findFirst({
      where: {
        articleId,
        isActive: true,
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: new Date() } }] },
          { OR: [{ endAt: null }, { endAt: { gte: new Date() } }] },
        ],
      },
      select: { sponsorName: true, disclosureLabel: true },
    }),
    prisma.monetizationDisclosure.findFirst({ where: { key: 'article-affiliate', enabled: true }, select: { body: true } }),
  ]);

  const offers: PublicOffer[] = placements.map((p) => ({
    placementId: p.id,
    linkId: p.link.id,
    label: p.link.label,
    href: `/go/${p.link.id}/`,
    rel: relString(p.link.rel),
    category: p.link.category,
    context: p.link.editorialContext,
  }));

  return {
    offers,
    sponsored: sponsorship ? { sponsorName: sponsorship.sponsorName, disclosureLabel: sponsorship.disclosureLabel } : null,
    showAffiliateDisclosure: offers.length > 0,
    disclosureBody: disclosure?.body ?? null,
  };
}

export interface PublicAdPlacement {
  id: string;
  slot: string;
  name: string;
  responsive: boolean;
}

/** Active ad placements for a page scope. Returns [] unless the owner has enabled
 * AdSense in config — and even when enabled, the renderer shows a reserved, clearly
 * labeled container with NO ad script injected in this batch (§9/§10/§25). */
export async function getActiveAdPlacements(pageScope: string): Promise<PublicAdPlacement[]> {
  const settings = await getMonetizationSettings();
  if (!settings.adsenseEnabled) return [];
  const rows = await prisma.adPlacement.findMany({
    where: { enabled: true, pageScope: { in: [pageScope, 'global'] } },
    orderBy: [{ priority: 'desc' }, { position: 'asc' }],
    select: { id: true, slot: true, name: true, responsive: true },
  });
  return rows.map((r) => ({ id: r.id, slot: r.slot, name: r.name, responsive: r.responsive }));
}
