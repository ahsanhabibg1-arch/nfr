import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * PM-04 — information pages on the centralized SEO architecture.
 *
 * The rule these tests exist for is the one that is easy to get wrong:
 * **a draft SEO change must not reach the live page.** EntitySeo is a single
 * row per entity, so editing it would otherwise take effect the instant it was
 * saved — the body politely waiting for approval while the title, canonical and
 * robots went live immediately. Publication captures the SEO into the snapshot,
 * and these tests read the snapshot the way the renderer does.
 */
const dbUrl = process.env.DATABASE_URL ?? '';
const dbSuite = dbUrl ? describe : describe.skip;

dbSuite('PM-04 — info page SEO through EntitySeo', () => {
  let prisma: PrismaClient;
  let svc: typeof import('../lib/cms/infoPageService');
  let actor: { id: string; roles: ['super_admin'] };
  const madeUsers: string[] = [];
  const madeSlugs: string[] = [];
  const rid = () => Math.random().toString(36).slice(2, 8);

  async function publish(slug: string, title: string, body: string) {
    await svc.saveInfoPageDraft(actor, { slug, title, body });
    await svc.submitForReview(actor, slug);
    await svc.approveInfoPage(actor, slug);
    await svc.publishInfoPage(actor, slug);
  }

  async function setSeo(slug: string, data: Record<string, unknown>) {
    const page = await prisma.infoPage.findUniqueOrThrow({ where: { slug }, select: { id: true } });
    await prisma.entitySeo.upsert({
      where: { entityType_entityId: { entityType: 'INFO_PAGE', entityId: page.id } },
      create: { entityType: 'INFO_PAGE', entityId: page.id, ...data },
      update: data,
    });
  }

  beforeAll(async () => {
    if (!dbUrl) return;
    prisma = new PrismaClient();
    svc = await import('../lib/cms/infoPageService');
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
    const u = await prisma.user.create({ data: { email: `seo-${rid()}@example.com`, name: 'SEO Tester', status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    madeUsers.push(u.id);
    actor = { id: u.id, roles: ['super_admin'] };
  });

  afterAll(async () => {
    if (!dbUrl) return;
    const pages = await prisma.infoPage.findMany({ where: { slug: { in: madeSlugs } }, select: { id: true } });
    await prisma.entitySeo.deleteMany({ where: { entityType: 'INFO_PAGE', entityId: { in: pages.map((p) => p.id) } } });
    await prisma.infoPage.deleteMany({ where: { slug: { in: madeSlugs } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: madeUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: madeUsers } } });
    await prisma.$disconnect();
  });

  it('INFO_PAGE is a real entity type in the centralized module', async () => {
    const { LANDING_TYPES, permForEntity } = await import('../lib/cms/landingEntities');
    expect(LANDING_TYPES).toContain('INFO_PAGE');
    // Info pages answer to the same permission their own CRUD does.
    expect(permForEntity('INFO_PAGE')).toBe('system.config');
  });

  it('publication captures the SEO that was set at that moment', async () => {
    const slug = `seo-capture-${rid()}`; madeSlugs.push(slug);
    await svc.saveInfoPageDraft(actor, { slug, title: 'T', body: '<p>b</p>' });
    await setSeo(slug, { seoTitle: 'Captured Title', metaDescription: 'Captured description', ogImage: '/api/media/og.png', noindex: false });
    await svc.submitForReview(actor, slug);
    await svc.approveInfoPage(actor, slug);
    await svc.publishInfoPage(actor, slug);

    const live = await svc.getPublishedInfoPage(slug);
    expect(live!.seo).not.toBeNull();
    expect(live!.seo!.seoTitle).toBe('Captured Title');
    expect(live!.seo!.metaDescription).toBe('Captured description');
    expect(live!.seo!.ogImage).toBe('/api/media/og.png');
  });

  it('EDITING SEO AFTER PUBLICATION DOES NOT CHANGE THE LIVE PAGE', async () => {
    const slug = `seo-isolation-${rid()}`; madeSlugs.push(slug);
    await svc.saveInfoPageDraft(actor, { slug, title: 'T', body: '<p>b</p>' });
    await setSeo(slug, { seoTitle: 'V1 SEO' });
    await svc.submitForReview(actor, slug);
    await svc.approveInfoPage(actor, slug);
    await svc.publishInfoPage(actor, slug);

    // The draft-side edit. This is the one that used to leak straight to live.
    await setSeo(slug, { seoTitle: 'V2 SEO — still a draft' });

    const live = await svc.getPublishedInfoPage(slug);
    expect(live!.seo!.seoTitle, 'readers keep the SEO that was approved with this content').toBe('V1 SEO');

    // ...and it goes live only when the page is published again. A SEO-only
    // change touches no body, so the status is moved back explicitly.
    await svc.revertToDraft(actor, slug);
    await svc.submitForReview(actor, slug);
    await svc.approveInfoPage(actor, slug);
    await svc.publishInfoPage(actor, slug);
    expect((await svc.getPublishedInfoPage(slug))!.seo!.seoTitle).toBe('V2 SEO — still a draft');
  });

  it('a page published before PM-04 keeps rendering, with no SEO object', async () => {
    // Backward compatibility: snapshots written by the earlier migration have
    // no `seo` key at all, and must not become unreadable.
    const slug = `seo-legacyshape-${rid()}`; madeSlugs.push(slug);
    await svc.saveInfoPageDraft(actor, { slug, title: 'Old', body: '<p>old</p>' });
    await prisma.infoPage.update({
      where: { slug },
      data: {
        status: 'PUBLISHED',
        publishedSnapshot: { title: 'Old', body: '<p>old</p>', seoTitle: 'Row Title', metaDescription: null, publishedAt: new Date().toISOString() },
      },
    });
    const live = await svc.getPublishedInfoPage(slug);
    expect(live).not.toBeNull();
    expect(live!.seo).toBeNull();
    expect(live!.seoTitle, 'and the row-level columns still supply the title').toBe('Row Title');
  });

  it('a live page marked noindex is kept out of the sitemap', async () => {
    const slug = `seo-noindex-${rid()}`; madeSlugs.push(slug);
    await publish(slug, 'Hidden', '<p>hidden</p>');
    const { buildSitemapEntries } = await import('../lib/seo/sitemapEntries');

    // A published custom page IS listed — it had no entry at all before PM-04.
    expect((await buildSitemapEntries()).some((e) => e.url.includes(`/info/${slug}/`))).toBe(true);

    await setSeo(slug, { noindex: true });
    await svc.revertToDraft(actor, slug);
    await svc.submitForReview(actor, slug);
    await svc.approveInfoPage(actor, slug);
    await svc.publishInfoPage(actor, slug);

    expect(
      (await buildSitemapEntries()).some((e) => e.url.includes(`/info/${slug}/`)),
      'a sitemap entry for a noindex page is a contradiction',
    ).toBe(false);
  });

  it('an archived page leaves the sitemap', async () => {
    const slug = `seo-archived-${rid()}`; madeSlugs.push(slug);
    await publish(slug, 'Temp', '<p>t</p>');
    const { buildSitemapEntries } = await import('../lib/seo/sitemapEntries');
    expect((await buildSitemapEntries()).some((e) => e.url.includes(`/info/${slug}/`))).toBe(true);

    await svc.archiveInfoPage(actor, slug);
    expect((await buildSitemapEntries()).some((e) => e.url.includes(`/info/${slug}/`))).toBe(false);
  });
});
