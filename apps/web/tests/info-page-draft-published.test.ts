import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * The published/draft split for information pages (S-1 / D-09).
 *
 * Every assertion here is about one promise: **what a visitor sees must not
 * change until someone publishes.** Before this work a published page could not
 * be edited at all — the only way through was to unpublish it, which pulled the
 * page off the public site and, for a policy URL, replaced approved wording
 * with unapproved built-in text. So these tests exercise the live read path
 * (`resolvePublicInfoPage`) rather than the row, because the row was never the
 * thing that was wrong; what readers got from it was.
 *
 * Runs against the ISOLATED test database and self-skips without one.
 */
const dbUrl = process.env.DATABASE_URL ?? '';
const dbSuite = dbUrl ? describe : describe.skip;

dbSuite('information pages — draft and published are separate', () => {
  let prisma: PrismaClient;
  let svc: typeof import('../lib/cms/infoPageService');
  let actor: { id: string; roles: ['super_admin'] };
  const madeUsers: string[] = [];
  const madeSlugs: string[] = [];
  const rid = () => Math.random().toString(36).slice(2, 8);

  /** A fresh CUSTOM page, published with V1 content. */
  async function publishedPage(slug: string, title: string, body: string) {
    madeSlugs.push(slug);
    await svc.saveInfoPageDraft(actor, { slug, title, body });
    await svc.submitForReview(actor, slug);
    await svc.approveInfoPage(actor, slug);
    await svc.publishInfoPage(actor, slug);
  }

  beforeAll(async () => {
    if (!dbUrl) return;
    prisma = new PrismaClient();
    svc = await import('../lib/cms/infoPageService');
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
    const u = await prisma.user.create({
      data: { email: `infopage-${rid()}@example.com`, name: 'Info Page Tester', status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    madeUsers.push(u.id);
    actor = { id: u.id, roles: ['super_admin'] };
  });

  afterAll(async () => {
    if (!dbUrl) return;
    await prisma.infoPage.deleteMany({ where: { slug: { in: madeSlugs } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: madeUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: madeUsers } } });
    await prisma.$disconnect();
  });

  // ---- the central guarantee ----------------------------------------------

  it('a visitor keeps seeing V1 while V2 is being written', async () => {
    const slug = `t-isolation-${rid()}`;
    await publishedPage(slug, 'V1 Title', '<p>V1 body</p>');

    // The edit that used to be impossible.
    await svc.saveInfoPageDraft(actor, { slug, title: 'V2 Title', body: '<p>V2 body</p>' });

    const live = await svc.resolvePublicInfoPage(slug);
    expect(live.kind).toBe('live');
    if (live.kind !== 'live') return;
    expect(live.page.title).toBe('V1 Title');
    expect(live.page.body).toContain('V1 body');

    // ...and the draft really did change underneath.
    const row = await prisma.infoPage.findUniqueOrThrow({ where: { slug } });
    expect(row.title).toBe('V2 Title');
    expect(row.status).toBe('DRAFT');
  });

  it('publishing promotes content and SEO together, never half of each', async () => {
    const slug = `t-atomic-${rid()}`;
    await publishedPage(slug, 'V1', '<p>one</p>');
    await svc.saveInfoPageDraft(actor, {
      slug, title: 'V2', body: '<p>two</p>',
      seoTitle: 'V2 SEO', metaDescription: 'V2 description',
    });
    await svc.submitForReview(actor, slug);
    await svc.approveInfoPage(actor, slug);
    await svc.publishInfoPage(actor, slug);

    const live = await svc.resolvePublicInfoPage(slug);
    expect(live.kind).toBe('live');
    if (live.kind !== 'live') return;
    // All four move as one. A mixed version is the failure this guards.
    expect(live.page.title).toBe('V2');
    expect(live.page.body).toContain('two');
    expect(live.page.seoTitle).toBe('V2 SEO');
    expect(live.page.metaDescription).toBe('V2 description');
  });

  // ---- the §9 fallback correction -----------------------------------------

  it('unpublishing a POLICY page 404s instead of exposing the built-in draft', async () => {
    const slug = 'corrections'; // a real legacy slug, with compiled-in copy behind it
    const existed = await prisma.infoPage.findUnique({ where: { slug } });
    try {
      await publishedPage(slug, 'Managed Corrections', '<p>Approved wording.</p>');
      expect((await svc.resolvePublicInfoPage(slug)).kind).toBe('live');

      await svc.unpublishInfoPage(actor, slug);

      // The point: NOT `unmanaged`. A row still exists, so the compiled-in
      // pending-review text must not stand in for the page that was taken down.
      expect((await svc.resolvePublicInfoPage(slug)).kind).toBe('withdrawn');
    } finally {
      if (!existed) await prisma.infoPage.deleteMany({ where: { slug } });
    }
  });

  it('a slug with no row at all still falls back to the built-in copy', async () => {
    // Nothing has ever been managed here, so the compiled-in text is the only
    // content there is and the renderer may use it.
    expect((await svc.resolvePublicInfoPage(`t-never-managed-${rid()}`)).kind).toBe('unmanaged');
  });

  // ---- revisions -----------------------------------------------------------

  it('restoring an old revision loads the draft and leaves the live page alone', async () => {
    const slug = `t-revision-${rid()}`;
    await publishedPage(slug, 'V1', '<p>first</p>');
    await svc.saveInfoPageDraft(actor, { slug, title: 'V2', body: '<p>second</p>' });
    await svc.submitForReview(actor, slug);
    await svc.approveInfoPage(actor, slug);
    await svc.publishInfoPage(actor, slug); // V2 is now live

    const revisions = await svc.listInfoPageRevisions(actor, slug);
    expect(revisions.length).toBeGreaterThan(0);
    const first = revisions[revisions.length - 1];
    await svc.restoreInfoPageRevision(actor, slug, first.revisionNo);

    const live = await svc.resolvePublicInfoPage(slug);
    expect(live.kind).toBe('live');
    if (live.kind !== 'live') return;
    expect(live.page.title).toBe('V2'); // readers are undisturbed by a restore

    const row = await prisma.infoPage.findUniqueOrThrow({ where: { slug } });
    expect(row.status).toBe('DRAFT');
    expect(row.approvedAt).toBeNull(); // a restore is reviewable, not auto-trusted
  });

  // ---- concurrency ---------------------------------------------------------

  it('a stale editor session is refused rather than silently winning', async () => {
    const slug = `t-concurrency-${rid()}`;
    madeSlugs.push(slug);
    await svc.saveInfoPageDraft(actor, { slug, title: 'Base', body: '<p>base</p>' });
    const stale = (await prisma.infoPage.findUniqueOrThrow({ where: { slug } })).version;

    await svc.saveInfoPageDraft(actor, { slug, title: 'Editor A', body: '<p>a</p>' }, stale);
    await expect(
      svc.saveInfoPageDraft(actor, { slug, title: 'Editor B', body: '<p>b</p>' }, stale),
    ).rejects.toThrow(/changed by someone else/i);

    expect((await prisma.infoPage.findUniqueOrThrow({ where: { slug } })).title).toBe('Editor A');
  });

  // ---- protection and archival ---------------------------------------------

  it('a protected page cannot be archived or deleted', async () => {
    const slug = `t-protected-${rid()}`;
    madeSlugs.push(slug);
    await svc.saveInfoPageDraft(actor, { slug, title: 'Protected', body: '<p>x</p>' });
    await prisma.infoPage.update({ where: { slug }, data: { isProtected: true, pageType: 'SYSTEM' } });

    await expect(svc.archiveInfoPage(actor, slug)).rejects.toThrow(/protected/i);
    await expect(svc.deleteInfoPage(actor, slug)).rejects.toThrow(/protected/i);
  });

  it('archiving withdraws a page, and restoring returns it as a draft, not live', async () => {
    const slug = `t-archive-${rid()}`;
    await publishedPage(slug, 'Live', '<p>live</p>');
    await svc.archiveInfoPage(actor, slug);
    expect((await svc.resolvePublicInfoPage(slug)).kind).toBe('withdrawn');

    await svc.restoreInfoPage(actor, slug);
    // Still not live: the reason it was archived may well still apply.
    expect((await svc.resolvePublicInfoPage(slug)).kind).toBe('withdrawn');
    expect((await prisma.infoPage.findUniqueOrThrow({ where: { slug } })).status).toBe('DRAFT');
  });

  it('a custom page must be archived before it can be permanently deleted', async () => {
    const slug = `t-delete-${rid()}`;
    madeSlugs.push(slug);
    await svc.saveInfoPageDraft(actor, { slug, title: 'Temp', body: '<p>x</p>' });

    await expect(svc.deleteInfoPage(actor, slug)).rejects.toThrow(/archive this page first/i);
    await svc.archiveInfoPage(actor, slug);
    await svc.deleteInfoPage(actor, slug);
    expect(await prisma.infoPage.findUnique({ where: { slug } })).toBeNull();
  });
});
