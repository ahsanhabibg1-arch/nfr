import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as SectionSvc from '../lib/cms/sectionConfigService';
import type * as NavSvc from '../lib/cms/navigationService';
import type * as InfoSvc from '../lib/cms/infoPageService';
import type * as ContentMod from '../lib/content';

let available = false;
let prisma: PrismaClient;
let sectionSvc: typeof SectionSvc;
let navSvc: typeof NavSvc;
let infoSvc: typeof InfoSvc;
let content: typeof ContentMod;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    available = true;
    sectionSvc = await import('../lib/cms/sectionConfigService');
    navSvc = await import('../lib/cms/navigationService');
    infoSvc = await import('../lib/cms/infoPageService');
    content = await import('../lib/content');
  } catch {}
}

const rid = () => Math.random().toString(36).slice(2, 8);
const suite = available ? describe : describe.skip;
const actors: Record<string, Actor> = {};
const userIds: string[] = [];

suite('Batch 28 — CMS gap remediation integration', () => {
  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const user = await prisma.user.create({ data: { email: `b28-${roleKey}-${rid()}@example.com`, name: `B28 ${roleKey}`, status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    userIds.push(user.id);
    return { id: user.id, roles: [roleKey] };
  }

  beforeAll(async () => {
    actors.admin = await makeUser('super_admin');
    actors.editor = await makeUser('editor');
  });

  afterAll(async () => {
    await prisma.infoPage.deleteMany({ where: { createdById: { in: userIds } } });
    await prisma.sectionConfig.deleteMany({ where: { updatedById: { in: userIds } } });
    await prisma.navigationItem.deleteMany({ where: { label: { startsWith: 'B28-' } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  // --- A. Section Landing CMS ---
  it('upsertSectionConfig saves and getSectionMeta merges overrides with fallback', async () => {
    const cfg = await sectionSvc.upsertSectionConfig(actors.admin, {
      sectionKey: 'competition',
      displayName: 'B28 Custom Name',
      tagline: 'B28 Custom Tagline',
    });
    expect(cfg.displayName).toBe('B28 Custom Name');

    const meta = await content.getSectionMeta('competition');
    expect(meta).toBeDefined();
    expect(meta!.name).toBe('B28 Custom Name');
    expect(meta!.tagline).toBe('B28 Custom Tagline');
    expect(meta!.description).toBeTruthy(); // fallback description

    // Clean up
    await prisma.sectionConfig.delete({ where: { sectionKey: 'competition' } });
    const restored = await content.getSectionMeta('competition');
    expect(restored!.name).not.toBe('B28 Custom Name');
  });

  it('unauthorized editor cannot modify section config', async () => {
    await expect(sectionSvc.upsertSectionConfig(actors.editor, { sectionKey: 'competition', displayName: 'hacked' }))
      .rejects.toThrow(/not permitted/i);
  });

  it('missing section overrides return hardcoded fallback', async () => {
    const meta = await content.getSectionMeta('entertainment');
    expect(meta).toBeDefined();
    expect(meta!.name).toBeTruthy();
  });

  // --- B. Quick-Access Links ---
  it('admin can create, reorder, hide, and remove quick-access links', async () => {
    const { id } = await navSvc.createNavItem(actors.admin, {
      location: 'quick-access', label: 'B28-QA-Test', url: '/test-link/', description: 'Test description',
      sortOrder: 1, isExternal: false, visible: true,
    });
    expect(id).toBeTruthy();

    await navSvc.updateNavItem(actors.admin, id, {
      location: 'quick-access', label: 'B28-QA-Updated', url: '/test-link/', description: 'Updated desc',
      sortOrder: 5, isExternal: false, visible: true,
    });
    const items = await navSvc.listNavItems();
    const updated = items.find((i) => i.id === id);
    expect(updated?.label).toBe('B28-QA-Updated');
    expect(updated?.sortOrder).toBe(5);

    await navSvc.setNavVisible(actors.admin, id, false);
    const qa = await navSvc.getQuickAccessLinks();
    expect(qa.find((q) => q.id === id)).toBeUndefined(); // hidden

    await navSvc.deleteNavItem(actors.admin, id);
  });

  it('getQuickAccessLinks falls back to hardcoded when no DB rows', async () => {
    await prisma.navigationItem.deleteMany({ where: { location: 'quick-access' } });
    const links = await navSvc.getQuickAccessLinks();
    expect(links.length).toBeGreaterThan(0);
    expect(links[0].label).toBeTruthy();
  });

  it('rejects unsafe external URLs in quick-access', async () => {
    await expect(navSvc.createNavItem(actors.admin, {
      location: 'quick-access', label: 'B28-Evil', url: 'javascript:alert(1)',
      isExternal: false, visible: true,
    })).rejects.toThrow(/internal links must start/i);

    await expect(navSvc.createNavItem(actors.admin, {
      location: 'quick-access', label: 'B28-Evil', url: 'http://insecure.com',
      isExternal: true, visible: true,
    })).rejects.toThrow(/https/i);
  });

  // --- C. Info & Legal Pages ---
  it('full info page workflow: draft → review → approve → publish', async () => {
    const page = await infoSvc.saveInfoPageDraft(actors.admin, {
      slug: 'about', title: 'B28 About Test', body: '<p>Test body</p>',
      seoTitle: 'B28 SEO Title', metaDescription: 'B28 meta desc',
    });
    expect(page.status).toBe('DRAFT');

    let pub = await infoSvc.getPublishedInfoPage('about');
    expect(pub).toBeNull(); // not published yet

    await infoSvc.submitForReview(actors.admin, 'about');
    const reviewed = await infoSvc.getInfoPage('about');
    expect(reviewed!.status).toBe('PENDING_REVIEW');

    await infoSvc.approveInfoPage(actors.admin, 'about');
    const approved = await infoSvc.getInfoPage('about');
    expect(approved!.status).toBe('APPROVED');
    expect(approved!.approvedById).toBe(actors.admin.id);

    await infoSvc.publishInfoPage(actors.admin, 'about');
    pub = await infoSvc.getPublishedInfoPage('about');
    expect(pub).not.toBeNull();
    expect(pub!.title).toBe('B28 About Test');
    expect(pub!.seoTitle).toBe('B28 SEO Title');
  });

  it('cannot skip workflow steps', async () => {
    await expect(infoSvc.publishInfoPage(actors.admin, 'about')).rejects.toThrow(/approved/i);
    await expect(infoSvc.submitForReview(actors.admin, 'about')).rejects.toThrow(/draft/i);
  });

  it('revertToDraft refuses PUBLISHED pages — must unpublish first', async () => {
    await expect(infoSvc.revertToDraft(actors.admin, 'about')).rejects.toThrow(/unpublish/i);
  });

  it('unpublish removes PUBLISHED page from public view; hardcoded fallback takes over', async () => {
    await infoSvc.unpublishInfoPage(actors.admin, 'about');
    const pub = await infoSvc.getPublishedInfoPage('about');
    expect(pub).toBeNull(); // public now sees hardcoded

    const row = await infoSvc.getInfoPage('about');
    expect(row!.status).toBe('DRAFT');
    expect(row!.body).toBe('<p>Test body</p>'); // content preserved in DB
  });

  it('cannot edit a published page directly — must unpublish first', async () => {
    // Re-publish
    await infoSvc.saveInfoPageDraft(actors.admin, { slug: 'about', title: 'B28 v2', body: '<p>v2</p>' });
    await infoSvc.submitForReview(actors.admin, 'about');
    await infoSvc.approveInfoPage(actors.admin, 'about');
    await infoSvc.publishInfoPage(actors.admin, 'about');

    await expect(infoSvc.saveInfoPageDraft(actors.admin, { slug: 'about', title: 'sneaky edit', body: '<p>nope</p>' }))
      .rejects.toThrow(/published/i);

    // Clean up
    await infoSvc.unpublishInfoPage(actors.admin, 'about');
    await prisma.infoPage.deleteMany({ where: { slug: 'about', createdById: actors.admin.id } });
  });

  it('unauthorized editor cannot manage info pages', async () => {
    await expect(infoSvc.saveInfoPageDraft(actors.editor, { slug: 'about', title: 'x', body: 'x' }))
      .rejects.toThrow(/not permitted/i);
  });

  it('all 7 legal slugs are accepted', async () => {
    const slugs = ['about', 'privacy', 'terms', 'editorial-policy', 'affiliate-disclosure', 'corrections', 'contact'] as const;
    for (const slug of slugs) {
      const p = await infoSvc.saveInfoPageDraft(actors.admin, { slug, title: `B28 ${slug}`, body: `<p>${slug}</p>` });
      expect(p.slug).toBe(slug);
    }
  });
});
