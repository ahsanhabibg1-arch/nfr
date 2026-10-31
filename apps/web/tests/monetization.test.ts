import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as ArticleSvc from '../lib/cms/articleService';
import type * as MonSvc from '../lib/cms/monetizationService';

/**
 * Batch 08 — monetization integration (§27). Exercises the REAL services + DB:
 * partner lifecycle + verification/activation guard, link URL validation + dangerous
 * rejection, active/inactive/expired resolution (open-redirect/expired safety),
 * placement authorization, rodeo event/edition associations, disclosure + sponsored
 * rendering, reference-safe deletion, RBAC, click gating/aggregation, AdSense
 * disabled-by-default, and commercial compliance. Self-skips without DATABASE_URL.
 */
let available = false;
let prisma: PrismaClient;
let article: typeof ArticleSvc;
let mon: typeof MonSvc;
let pub: typeof import('../lib/monetization/publicMonetization');
let clicks: typeof import('../lib/monetization/clicks');
let monConfig: typeof import('../lib/monetization/config');
let anConfig: typeof import('../lib/analytics/config');

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    available = true;
    article = await import('../lib/cms/articleService');
    mon = await import('../lib/cms/monetizationService');
    pub = await import('../lib/monetization/publicMonetization');
    clicks = await import('../lib/monetization/clicks');
    monConfig = await import('../lib/monetization/config');
    anConfig = await import('../lib/analytics/config');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
  } catch {
    available = false;
  }
}
const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

suite('Batch 08 — monetization & affiliate', () => {
  const actors: Record<string, Actor> = {};
  const userIds: string[] = [];
  const partnerIds: string[] = [];
  const linkIds: string[] = [];
  const articleIds: string[] = [];

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({ data: { email: `b8-${roleKey}-${rid()}@example.com`, name: `B8 ${roleKey}`, status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    userIds.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }
  async function makeArticle(owner: Actor): Promise<string> {
    const a = await article.saveArticle(owner as ArticleSvc.ActorContext, {
      slug: `b8-${rid()}`, title: 'Monetization Test Article',
      excerpt: 'A valid excerpt long enough to satisfy the publication gate checks for this monetization integration test case.',
      blocks: [{ type: 'paragraph', text: 'Opening paragraph with enough words to clear the minimum body length guidance threshold for the analyzer here.' }],
      categoryName: 'NFR Competition', authorName: 'Mon Tester', imageRightsStatus: 'Staff Photo',
      imageAltText: 'Alt text for the monetization test photo.', seoTitle: 'Reasonable SEO Title For Monetization', metaDescription: 'A reasonable meta description within the configured guidance length for the monetization test case.',
    } as ArticleSvc.ArticleInput);
    articleIds.push(a.id);
    return a.id;
  }
  async function activePartner(): Promise<string> {
    const p = await mon.createPartner(actors.admin, { name: `Partner ${rid()}`, category: 'TICKETS' });
    partnerIds.push(p.id);
    await mon.setPartnerVerification(actors.admin, p.id, 'VERIFIED');
    await mon.setPartnerActive(actors.admin, p.id, true);
    return p.id;
  }
  async function activeLink(partnerId: string, over: Partial<MonSvc.LinkInput> = {}): Promise<string> {
    const l = await mon.createLink(actors.admin, { partnerId, label: `Link ${rid()}`, merchantUrl: 'https://merchant.example.com/p', category: 'TICKETS', ...over } as MonSvc.LinkInput);
    linkIds.push(l.id);
    await mon.setLinkActive(actors.admin, l.id, true);
    return l.id;
  }

  beforeAll(async () => {
    actors.admin = await makeUser('administrator');
    actors.editor = await makeUser('editor');
    actors.author = await makeUser('author');
    actors.seomgr = await makeUser('seo_manager');
  });

  afterAll(async () => {
    if (!available) return;
    for (const id of articleIds) await prisma.article.delete({ where: { id } }).catch(() => {});
    await prisma.affiliateClickAggregate.deleteMany({ where: { linkId: { in: linkIds } } }).catch(() => {});
    await prisma.affiliatePlacement.deleteMany({ where: { linkId: { in: linkIds } } }).catch(() => {});
    await prisma.affiliateLink.deleteMany({ where: { id: { in: linkIds } } }).catch(() => {});
    await prisma.commercialEntityAssociation.deleteMany({ where: { partnerId: { in: partnerIds } } }).catch(() => {});
    await prisma.affiliatePartner.deleteMany({ where: { id: { in: partnerIds } } }).catch(() => {});
    for (const id of userIds) {
      await prisma.userRole.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
  });

  it('partner starts unverified/inactive and cannot be activated until verified', async () => {
    const p = await mon.createPartner(actors.admin, { name: `Guard ${rid()}`, category: 'STREAMING' });
    partnerIds.push(p.id);
    expect(p.isActive).toBe(false);
    expect(p.verificationStatus).toBe('UNVERIFIED');
    await expect(mon.setPartnerActive(actors.admin, p.id, true)).rejects.toMatchObject({ code: 'conflict' });
    await mon.setPartnerVerification(actors.admin, p.id, 'VERIFIED');
    await mon.setPartnerActive(actors.admin, p.id, true);
    const after = await prisma.affiliatePartner.findUnique({ where: { id: p.id } });
    expect(after?.isActive).toBe(true);
  });

  it('rejects dangerous and private link URLs, accepts valid https', async () => {
    const partnerId = await activePartner();
    await expect(mon.createLink(actors.admin, { partnerId, label: 'bad', merchantUrl: 'javascript:alert(1)', category: 'OTHER' } as MonSvc.LinkInput)).rejects.toMatchObject({ code: 'validation' });
    await expect(mon.createLink(actors.admin, { partnerId, label: 'bad2', merchantUrl: 'http://127.0.0.1/x', category: 'OTHER' } as MonSvc.LinkInput)).rejects.toMatchObject({ code: 'validation' });
    const l = await mon.createLink(actors.admin, { partnerId, label: 'ok', merchantUrl: 'https://merchant.example.com/x', category: 'OTHER' } as MonSvc.LinkInput);
    linkIds.push(l.id);
    expect(l.id).toBeTruthy();
  });

  it('resolves only active, in-effect links (inactive + expired return null — open-redirect/expired safe)', async () => {
    const partnerId = await activePartner();
    const active = await activeLink(partnerId, { trackingUrl: 'https://track.example.com/go?x=1' });
    const resolved = await pub.resolveActiveAffiliateLink(active);
    expect(resolved?.destination).toBe('https://track.example.com/go?x=1');

    const inactive = await mon.createLink(actors.admin, { partnerId, label: 'inactive', merchantUrl: 'https://merchant.example.com/y', category: 'OTHER' } as MonSvc.LinkInput);
    linkIds.push(inactive.id);
    expect(await pub.resolveActiveAffiliateLink(inactive.id)).toBeNull();

    const expired = await activeLink(partnerId, { effectiveTo: new Date(Date.now() - 86_400_000).toISOString() });
    expect(await pub.resolveActiveAffiliateLink(expired)).toBeNull();

    expect(await pub.resolveActiveAffiliateLink('nope')).toBeNull();
  });

  it('authorizes article placements by edit rights; activation needs placement perm', async () => {
    const partnerId = await activePartner();
    const linkId = await activeLink(partnerId);
    const authorArticle = await makeArticle(actors.author);
    const editorArticle = await makeArticle(actors.editor);

    // author can propose on own article
    const pl = await mon.createArticlePlacement(actors.author, { linkId, entityType: 'ARTICLE', entityId: authorArticle });
    expect(pl.isActive).toBe(false);
    // author CANNOT propose on someone else's article
    await expect(mon.createArticlePlacement(actors.author, { linkId, entityType: 'ARTICLE', entityId: editorArticle })).rejects.toMatchObject({ code: 'forbidden' });
    // author CANNOT activate (needs placement.manage)
    await expect(mon.setPlacementActive(actors.author, pl.id, true)).rejects.toMatchObject({ code: 'forbidden' });
    // admin activates
    await mon.setPlacementActive(actors.admin, pl.id, true);
    await prisma.article.update({ where: { id: authorArticle }, data: { workflowStatus: 'PUBLISHED', publishedAt: new Date() } });

    const m = await pub.getArticleMonetization(authorArticle);
    expect(m.offers.length).toBe(1);
    expect(m.offers[0].href).toBe(`/go/${linkId}/`);
    expect(m.offers[0].rel).toContain('sponsored');
    expect(m.showAffiliateDisclosure).toBe(true);
  });

  it('keeps rodeo event and edition commercial relationships separate', async () => {
    const partnerId = await activePartner();
    const ev = await mon.createAssociation(actors.admin, { partnerId, entityType: 'RODEO_EVENT', entityId: 'evt-1', relationshipType: 'streaming' });
    const ed = await mon.createAssociation(actors.admin, { partnerId, entityType: 'RODEO_EDITION', entityId: 'edtn-2026', relationshipType: 'tickets' });
    expect(ev.entityType).toBe('RODEO_EVENT');
    expect(ed.entityType).toBe('RODEO_EDITION');
    const eventAssoc = await mon.listAssociations(actors.admin, { entityType: 'RODEO_EVENT', entityId: 'evt-1' });
    expect(eventAssoc.every((a) => a.entityType === 'RODEO_EVENT')).toBe(true);
  });

  it('classifies sponsored content and renders its label', async () => {
    const art = await makeArticle(actors.author);
    await prisma.article.update({ where: { id: art }, data: { workflowStatus: 'PUBLISHED', publishedAt: new Date() } });
    const s = await mon.createSponsored(actors.admin, { articleId: art, sponsorName: 'Acme Boots', disclosureLabel: 'Sponsored' });
    await mon.setSponsoredActive(actors.admin, s.id, true);
    const m = await pub.getArticleMonetization(art);
    expect(m.sponsored?.sponsorName).toBe('Acme Boots');
    expect(m.sponsored?.disclosureLabel).toBe('Sponsored');
  });

  it('enforces reference-safe deletion', async () => {
    const partnerId = await activePartner();
    const linkId = await activeLink(partnerId);
    await expect(mon.deletePartner(actors.admin, partnerId)).rejects.toMatchObject({ code: 'conflict' });
    const art = await makeArticle(actors.author);
    const pl = await mon.createArticlePlacement(actors.admin, { linkId, entityType: 'ARTICLE', entityId: art });
    await expect(mon.deleteLink(actors.admin, linkId)).rejects.toMatchObject({ code: 'conflict' });
    await mon.deletePlacement(actors.admin, pl.id);
  });

  it('enforces RBAC: authors/editors cannot manage partners/links/config', async () => {
    await expect(mon.createPartner(actors.author, { name: 'x', category: 'OTHER' })).rejects.toMatchObject({ code: 'forbidden' });
    const partnerId = await activePartner();
    await expect(mon.createLink(actors.editor, { partnerId, label: 'x', merchantUrl: 'https://m.example.com/x', category: 'OTHER' } as MonSvc.LinkInput)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(mon.updateMonetizationConfig(actors.author, { adsenseEnabled: true, adsensePublisherId: null, clickTrackingEnabled: true, siteDisclosureEnabled: true })).rejects.toMatchObject({ code: 'forbidden' });
    // SEO Manager: compliance ok, config forbidden
    const c = await mon.getCommercialCompliance(actors.seomgr);
    expect(Array.isArray(c)).toBe(true);
    await expect(mon.updateMonetizationConfig(actors.seomgr, { adsenseEnabled: true, adsensePublisherId: null, clickTrackingEnabled: true, siteDisclosureEnabled: true })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('gates outbound click tracking (disabled by default; respects analytics collection)', async () => {
    const partnerId = await activePartner();
    const linkId = await activeLink(partnerId);
    // Default: monetization clickTracking off → disabled
    await prisma.monetizationConfiguration.upsert({ where: { key: monConfig.MONETIZATION_CONFIG_KEY }, create: { key: monConfig.MONETIZATION_CONFIG_KEY, value: { ...monConfig.DEFAULT_MONETIZATION_SETTINGS } }, update: { value: { ...monConfig.DEFAULT_MONETIZATION_SETTINGS } } });
    expect((await clicks.recordOutboundClick({ clientKey: `k-${rid()}` }, linkId)).reason).toBe('disabled');

    // Enable monetization tracking but analytics collection still off → still disabled
    await prisma.monetizationConfiguration.upsert({ where: { key: monConfig.MONETIZATION_CONFIG_KEY }, create: { key: monConfig.MONETIZATION_CONFIG_KEY, value: { ...monConfig.DEFAULT_MONETIZATION_SETTINGS, clickTrackingEnabled: true } }, update: { value: { ...monConfig.DEFAULT_MONETIZATION_SETTINGS, clickTrackingEnabled: true } } });
    await prisma.analyticsConfig.upsert({ where: { key: anConfig.ANALYTICS_CONFIG_KEY }, create: { key: anConfig.ANALYTICS_CONFIG_KEY, value: { ...anConfig.DEFAULT_ANALYTICS_SETTINGS, collectionEnabled: false } }, update: { value: { ...anConfig.DEFAULT_ANALYTICS_SETTINGS, collectionEnabled: false } } });
    expect((await clicks.recordOutboundClick({ clientKey: `k-${rid()}` }, linkId)).reason).toBe('disabled');

    // Both on → records + aggregates; invalid link → invalid
    await prisma.analyticsConfig.upsert({ where: { key: anConfig.ANALYTICS_CONFIG_KEY }, create: { key: anConfig.ANALYTICS_CONFIG_KEY, value: { ...anConfig.DEFAULT_ANALYTICS_SETTINGS, collectionEnabled: true } }, update: { value: { ...anConfig.DEFAULT_ANALYTICS_SETTINGS, collectionEnabled: true } } });
    expect((await clicks.recordOutboundClick({ clientKey: `k-${rid()}` }, linkId)).recorded).toBe(true);
    expect((await clicks.recordOutboundClick({ clientKey: `k-${rid()}` }, 'nope')).reason).toBe('invalid');
    const agg = await prisma.affiliateClickAggregate.findFirst({ where: { linkId } });
    expect((agg?.count ?? 0)).toBeGreaterThanOrEqual(1);

    // restore safe defaults
    await prisma.monetizationConfiguration.upsert({ where: { key: monConfig.MONETIZATION_CONFIG_KEY }, create: { key: monConfig.MONETIZATION_CONFIG_KEY, value: { ...monConfig.DEFAULT_MONETIZATION_SETTINGS } }, update: { value: { ...monConfig.DEFAULT_MONETIZATION_SETTINGS } } });
    await prisma.analyticsConfig.upsert({ where: { key: anConfig.ANALYTICS_CONFIG_KEY }, create: { key: anConfig.ANALYTICS_CONFIG_KEY, value: { ...anConfig.DEFAULT_ANALYTICS_SETTINGS } }, update: { value: { ...anConfig.DEFAULT_ANALYTICS_SETTINGS } } });
  });

  it('keeps external ad serving disabled by default', async () => {
    const settings = await monConfig.getMonetizationSettings();
    expect(settings.adsenseEnabled).toBe(false);
    const ad = await mon.createAdPlacement(actors.admin, { slot: 'ARTICLE_INCONTENT', name: 'Test', pageScope: 'article', device: 'all' });
    await mon.setAdPlacementEnabled(actors.admin, ad.id, true);
    // adsense disabled → nothing served even though the placement is enabled
    expect((await pub.getActiveAdPlacements('article')).length).toBe(0);
    await mon.deleteAdPlacement(actors.admin, ad.id);
  });

  it('flags commercial compliance issues (advisory, real data)', async () => {
    const partnerId = await activePartner();
    const expired = await activeLink(partnerId, { effectiveTo: new Date(Date.now() - 86_400_000).toISOString() });
    const findings = await mon.getCommercialCompliance(actors.admin);
    expect(findings.some((f) => f.code === 'expired-offer-active' && f.entity === `link:${expired}`)).toBe(true);
  });
});
