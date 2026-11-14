import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { sanitizeLegalHtml, isAllowedMediaSrc } from '../lib/cms/sanitizeHtml';

/**
 * PM-03 — Media Library integration, and the rules that keep it safe.
 *
 * The sanitiser tests do not need a database and always run; the hero tests do.
 */
describe('PM-03 — images in an information page body', () => {
  it('keeps an image the site actually serves', () => {
    const html = sanitizeLegalHtml('<p>x</p><img src="/api/media/abc.png" alt="A rodeo arena">');
    expect(html).toContain('<img');
    expect(html).toContain('/api/media/abc.png');
    expect(html).toContain('alt="A rodeo arena"');
  });

  it('adds lazy loading so a long policy page still paints quickly', () => {
    const html = sanitizeLegalHtml('<img src="/assets/images/x.jpg" alt="x">');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
  });

  it('DISCARDS a third-party image entirely rather than leaving it broken', () => {
    /*
      An external <img> on a policy page sends every reader's IP address and
      user-agent to someone else's server — tracking the site did not choose and
      cannot see. The tag is removed, not merely stripped of its source, so no
      broken image is published either.
    */
    const html = sanitizeLegalHtml('<p>before</p><img src="https://evil.example/track.gif" alt="x"><p>after</p>');
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain('<img');
    expect(html, 'the surrounding copy survives').toContain('before');
    expect(html).toContain('after');
  });

  it('rejects javascript: and data: image sources', () => {
    expect(isAllowedMediaSrc('javascript:alert(1)')).toBe(false);
    expect(isAllowedMediaSrc('data:image/svg+xml;base64,AAA')).toBe(false);
    expect(isAllowedMediaSrc('//cdn.example.com/x.png')).toBe(false);
    expect(isAllowedMediaSrc('/api/media/ok.png')).toBe(true);
  });

  it('still removes script and event handlers alongside the new image support', () => {
    const html = sanitizeLegalHtml('<p>ok</p><script>alert(1)</script><img src="/api/media/a.png" onerror="alert(1)" alt="a">');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).toContain('ok');
  });
});

const dbUrl = process.env.DATABASE_URL ?? '';
const dbSuite = dbUrl ? describe : describe.skip;

dbSuite('PM-03 — the hero image is a reference, not a copy', () => {
  let prisma: PrismaClient;
  let svc: typeof import('../lib/cms/infoPageService');
  let actor: { id: string; roles: ['super_admin'] };
  const madeUsers: string[] = [];
  const madeSlugs: string[] = [];
  let assetId = '';
  const rid = () => Math.random().toString(36).slice(2, 8);

  beforeAll(async () => {
    if (!dbUrl) return;
    prisma = new PrismaClient();
    svc = await import('../lib/cms/infoPageService');
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
    const u = await prisma.user.create({ data: { email: `media-${rid()}@example.com`, name: 'Media Tester', status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    madeUsers.push(u.id);
    actor = { id: u.id, roles: ['super_admin'] };

    const key = `pm03-${rid()}`;
    const asset = await prisma.mediaAsset.create({
      data: {
        storageKey: key, url: `/api/media/${key}.png`, title: 'Hero', filename: `${key}.png`,
        altText: 'Original alt', caption: 'Original caption', credit: 'Staff Photo',
      },
    });
    assetId = asset.id;
  });

  afterAll(async () => {
    if (!dbUrl) return;
    await prisma.infoPage.deleteMany({ where: { slug: { in: madeSlugs } } });
    if (assetId) await prisma.mediaAsset.deleteMany({ where: { id: assetId } });
    await prisma.userRole.deleteMany({ where: { userId: { in: madeUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: madeUsers } } });
    await prisma.$disconnect();
  });

  it('refuses a hero that is not in the Media Library', async () => {
    const slug = `hero-bad-${rid()}`; madeSlugs.push(slug);
    await expect(
      svc.saveInfoPageDraft(actor, { slug, title: 'T', body: '<p>b</p>', heroMediaId: '00000000-0000-4000-8000-000000000000' }),
    ).rejects.toThrow(/not in the Media Library/i);
  });

  it('resolves the asset metadata at publication, from the library record', async () => {
    const slug = `hero-ok-${rid()}`; madeSlugs.push(slug);
    await svc.saveInfoPageDraft(actor, { slug, title: 'T', body: '<p>b</p>', heroMediaId: assetId });
    await svc.submitForReview(actor, slug);
    await svc.approveInfoPage(actor, slug);
    await svc.publishInfoPage(actor, slug);

    const live = await svc.getPublishedInfoPage(slug);
    expect(live!.hero).not.toBeNull();
    expect(live!.hero!.alt, 'alt comes from the asset, not retyped per page').toBe('Original alt');
    expect(live!.hero!.caption).toBe('Original caption');
    expect(live!.hero!.credit).toBe('Staff Photo');
  });

  it('a later Media Library edit does not change the live page until it republishes', async () => {
    /*
      The published hero is resolved at publication precisely so a correction
      made in the Media Library cannot silently alter a live legal page. It
      reaches readers on the next publication, like every other change.
    */
    const slug = `hero-stable-${rid()}`; madeSlugs.push(slug);
    await svc.saveInfoPageDraft(actor, { slug, title: 'T', body: '<p>b</p>', heroMediaId: assetId });
    await svc.submitForReview(actor, slug);
    await svc.approveInfoPage(actor, slug);
    await svc.publishInfoPage(actor, slug);

    await prisma.mediaAsset.update({ where: { id: assetId }, data: { altText: 'Corrected alt' } });
    expect((await svc.getPublishedInfoPage(slug))!.hero!.alt).toBe('Original alt');

    await svc.revertToDraft(actor, slug);
    await svc.submitForReview(actor, slug);
    await svc.approveInfoPage(actor, slug);
    await svc.publishInfoPage(actor, slug);
    expect((await svc.getPublishedInfoPage(slug))!.hero!.alt).toBe('Corrected alt');
  });

  it('deleting the asset leaves the page intact', async () => {
    const slug = `hero-orphan-${rid()}`; madeSlugs.push(slug);
    const key = `pm03b-${rid()}`;
    const tmp = await prisma.mediaAsset.create({ data: { storageKey: key, url: `/api/media/${key}.png`, title: 'Temp', filename: `${key}.png` } });
    await svc.saveInfoPageDraft(actor, { slug, title: 'T', body: '<p>b</p>', heroMediaId: tmp.id });

    await prisma.mediaAsset.delete({ where: { id: tmp.id } });
    const row = await prisma.infoPage.findUniqueOrThrow({ where: { slug } });
    expect(row.heroMediaId, 'ON DELETE SET NULL — the page survives its image').toBeNull();
  });
});
