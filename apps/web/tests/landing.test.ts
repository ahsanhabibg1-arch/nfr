import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as SeoSvc from '../lib/cms/entitySeoService';
import type * as FaqSvc from '../lib/cms/faqService';
import type * as RodeoSvc from '../lib/cms/rodeoService';

/**
 * Batch 11 — landing SEO + FAQ integration (polymorphic integrity, authorization,
 * validation, ordering, enabled filtering, orphan cleanup). Self-skips without
 * DATABASE_URL.
 */
let available = false;
let prisma: PrismaClient;
let seo: typeof SeoSvc;
let faq: typeof FaqSvc;
let rodeoSvc: typeof RodeoSvc;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    available = true;
    seo = await import('../lib/cms/entitySeoService');
    faq = await import('../lib/cms/faqService');
    rodeoSvc = await import('../lib/cms/rodeoService');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
  } catch {
    available = false;
  }
}
const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

suite('Batch 11 — landing SEO & FAQ', () => {
  const tag = rid();
  const userIds: string[] = [];
  let admin: Actor;
  let author: Actor;
  let hubId = '';

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({ data: { email: `b11-${roleKey}-${tag}-${rid()}@example.com`, name: `B11 ${roleKey}`, status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    userIds.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }

  beforeAll(async () => {
    admin = await makeUser('administrator'); // has rodeo.manage + taxonomy.manage
    author = await makeUser('author'); // has neither
    const hub = await rodeoSvc.createHub(admin, { title: `Landing Test Hub ${tag}` });
    hubId = hub.id;
  });

  afterAll(async () => {
    if (!available) return;
    // Hub delete also cleans its EntitySeo/EntityFaq; guard in case the test didn't delete.
    await prisma.entityFaq.deleteMany({ where: { entityType: 'RODEO_HUB', entityId: hubId } }).catch(() => {});
    await prisma.entitySeo.deleteMany({ where: { entityType: 'RODEO_HUB', entityId: hubId } }).catch(() => {});
    await prisma.rodeoHub.delete({ where: { id: hubId } }).catch(() => {});
    for (const id of userIds) {
      await prisma.userRole.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
  });

  it('upserts EntitySeo with authorization + existence checks', async () => {
    await expect(seo.upsertEntitySeo(author, 'RODEO_HUB', hubId, { seoTitle: 'X', noindex: false })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(seo.upsertEntitySeo(admin, 'RODEO_HUB', `nope-${tag}`, { seoTitle: 'X', noindex: false })).rejects.toMatchObject({ code: 'not_found' });
    const row = await seo.upsertEntitySeo(admin, 'RODEO_HUB', hubId, { seoTitle: 'Custom Hub Title', metaDescription: 'Custom meta', noindex: true, intro: 'An editorial intro.' });
    expect(row.seoTitle).toBe('Custom Hub Title');
    expect((await seo.getEntitySeo('RODEO_HUB', hubId))?.noindex).toBe(true);
  });

  it('rejects off-site canonical overrides', async () => {
    await expect(seo.upsertEntitySeo(admin, 'RODEO_HUB', hubId, { noindex: false, canonicalOverride: 'https://evil.example.com/x' })).rejects.toMatchObject({ code: 'validation' });
    const ok = await seo.upsertEntitySeo(admin, 'RODEO_HUB', hubId, { noindex: false, canonicalOverride: '/rodeo-events/custom/' });
    expect(ok.canonicalOverride).toBe('/rodeo-events/custom/');
  });

  it('manages FAQs: auth, empty/duplicate rejection, ordering, enabled filtering', async () => {
    await expect(faq.createFaq(author, 'RODEO_HUB', hubId, { question: 'Q?', answer: 'A long enough answer.' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(faq.createFaq(admin, 'RODEO_HUB', hubId, { question: 'x', answer: 'y' })).rejects.toBeTruthy(); // too short (zod)

    const f1 = await faq.createFaq(admin, 'RODEO_HUB', hubId, { question: 'What time does it start?', answer: 'Verified start times are listed per edition.' });
    const f2 = await faq.createFaq(admin, 'RODEO_HUB', hubId, { question: 'Where is it held?', answer: 'See the venue on each edition page.' });
    // duplicate (case-insensitive) rejected
    await expect(faq.createFaq(admin, 'RODEO_HUB', hubId, { question: 'WHAT TIME DOES IT START?', answer: 'dup attempt here.' })).rejects.toMatchObject({ code: 'conflict' });

    // public list returns both, in order
    let pub = await faq.listPublicFaqs('RODEO_HUB', hubId);
    expect(pub.map((p) => p.id)).toEqual([f1.id, f2.id]);

    // reorder
    await faq.reorderFaqs(admin, 'RODEO_HUB', hubId, [f2.id, f1.id]);
    pub = await faq.listPublicFaqs('RODEO_HUB', hubId);
    expect(pub.map((p) => p.id)).toEqual([f2.id, f1.id]);

    // cross-entity reorder rejected
    await expect(faq.reorderFaqs(admin, 'RODEO_HUB', hubId, [f1.id])).rejects.toMatchObject({ code: 'validation' });

    // disabled FAQ excluded from public list
    await faq.setFaqEnabled(admin, f1.id, false);
    pub = await faq.listPublicFaqs('RODEO_HUB', hubId);
    expect(pub.map((p) => p.id)).toEqual([f2.id]);

    // delete requires permission
    await expect(faq.deleteFaq(author, f1.id)).rejects.toMatchObject({ code: 'forbidden' });
    await faq.deleteFaq(admin, f1.id);
    expect((await faq.listFaqsAdmin(admin, 'RODEO_HUB', hubId)).length).toBe(1);
  });

  it('cleans up SEO + FAQ rows when the owning entity is deleted (no orphans)', async () => {
    const hub = await rodeoSvc.createHub(admin, { title: `Cleanup Hub ${tag}` });
    await seo.upsertEntitySeo(admin, 'RODEO_HUB', hub.id, { seoTitle: 'Temp', noindex: false });
    await faq.createFaq(admin, 'RODEO_HUB', hub.id, { question: 'Temp question here?', answer: 'Temp answer here.' });
    await rodeoSvc.deleteHub(admin, hub.id);
    expect(await prisma.entitySeo.count({ where: { entityType: 'RODEO_HUB', entityId: hub.id } })).toBe(0);
    expect(await prisma.entityFaq.count({ where: { entityType: 'RODEO_HUB', entityId: hub.id } })).toBe(0);
  });
});
