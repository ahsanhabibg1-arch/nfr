import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as RodeoContent from '../lib/rodeoContent';
import type * as RodeoSvc from '../lib/cms/rodeoService';
import type * as SearchSvc from '../lib/search/publicSearch';

/**
 * Batch 10 — public rodeo entity pages integration. Verifies the published read layer,
 * the hub-or-event resolver, edition↔event integrity, published-only article linking,
 * cross-table slug uniqueness, and rodeo inclusion in public search. Self-skips without
 * DATABASE_URL. All rows use coined slugs and are cleaned up.
 */
let available = false;
let prisma: PrismaClient;
let rodeo: typeof RodeoContent;
let rodeoSvc: typeof RodeoSvc;
let search: typeof SearchSvc;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    available = true;
    rodeo = await import('../lib/rodeoContent');
    rodeoSvc = await import('../lib/cms/rodeoService');
    search = await import('../lib/search/publicSearch');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
  } catch {
    available = false;
  }
}
const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);
const TOKEN = 'quobbleton';

suite('Batch 10 — public rodeo entity pages', () => {
  const tag = rid();
  const hubId = `hub-${TOKEN}hub-${tag}`;
  const eventId = `event-${TOKEN}evt-${tag}`;
  const hubSlug = `${TOKEN}hub-${tag}`;
  const eventSlug = `${TOKEN}evt-${tag}`;
  const editionSlug = '2099';
  let editionId = '';
  let adminActor: Actor;
  const extraHubIds: string[] = [];
  const extraEventIds: string[] = [];
  const articleIds: string[] = [];

  beforeAll(async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'administrator' as RoleKey } });
    const u = await prisma.user.create({ data: { email: `b10-${tag}@example.com`, name: 'B10 Admin', status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    adminActor = { id: u.id, roles: ['administrator'] };

    await prisma.rodeoHub.create({ data: { id: hubId, slug: hubSlug, title: `${TOKEN} Hub ${tag}`, region: 'Test Region', description: 'A test rodeo hub.' } });
    await prisma.rodeoEvent.create({ data: { id: eventId, slug: eventSlug, name: `${TOKEN} Stampede ${tag}`, location: 'Test City', description: 'A coined recurring rodeo event.' } });
    await prisma.rodeoHubEvent.create({ data: { hubId, eventId } });
    const ed = await prisma.rodeoEventEdition.create({ data: { id: `edition-${tag}`, eventId, editionSlug, label: `${TOKEN} Stampede ${editionSlug}`, year: 2099, startAt: new Date('2099-07-01'), endAt: new Date('2099-07-10') } });
    editionId = ed.id;

    const cat = await prisma.category.findFirstOrThrow({ select: { id: true } });
    const author = await prisma.author.findFirstOrThrow({ select: { id: true } });
    const pub = await prisma.article.create({ data: { slug: `b10pub-${tag}`, title: 'Published rodeo dispatch', excerpt: 'x', articleType: 'news', workflowStatus: 'PUBLISHED', publishedAt: new Date(), authorId: author.id, categoryId: cat.id } });
    const draft = await prisma.article.create({ data: { slug: `b10draft-${tag}`, title: 'Draft rodeo dispatch', excerpt: 'x', articleType: 'news', workflowStatus: 'DRAFT', authorId: author.id, categoryId: cat.id } });
    articleIds.push(pub.id, draft.id);
    await prisma.articleEvent.createMany({ data: [{ articleId: pub.id, eventId }, { articleId: draft.id, eventId }] });
    await prisma.articleEdition.create({ data: { articleId: pub.id, editionId } });
  });

  afterAll(async () => {
    if (!available) return;
    for (const id of extraEventIds) await prisma.rodeoEvent.delete({ where: { id } }).catch(() => {});
    for (const id of extraHubIds) await prisma.rodeoHub.delete({ where: { id } }).catch(() => {});
    await prisma.articleEdition.deleteMany({ where: { editionId } }).catch(() => {});
    await prisma.articleEvent.deleteMany({ where: { eventId } }).catch(() => {});
    for (const id of articleIds) await prisma.article.delete({ where: { id } }).catch(() => {});
    await prisma.rodeoEventEdition.delete({ where: { id: editionId } }).catch(() => {});
    await prisma.rodeoHubEvent.deleteMany({ where: { eventId } }).catch(() => {});
    await prisma.rodeoEvent.delete({ where: { id: eventId } }).catch(() => {});
    await prisma.rodeoHub.delete({ where: { id: hubId } }).catch(() => {});
    await prisma.userRole.deleteMany({ where: { userId: adminActor.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: adminActor.id } }).catch(() => {});
  });

  it('reads an event with editions, hubs, and only published articles', async () => {
    const e = await rodeo.getPublicEventBySlug(eventSlug);
    expect(e).not.toBeNull();
    expect(e!.editions.map((x) => x.editionSlug)).toContain(editionSlug);
    expect(e!.hubs.map((h) => h.slug)).toContain(hubSlug);
    expect(e!.articles.map((a) => a.title)).toContain('Published rodeo dispatch');
    expect(e!.articles.map((a) => a.title)).not.toContain('Draft rodeo dispatch'); // published only
    expect(e!.indexable).toBe(true);
  });

  it('reads a hub that lists its associated events', async () => {
    const h = await rodeo.getPublicHubBySlug(hubSlug);
    expect(h).not.toBeNull();
    expect(h!.events.map((x) => x.slug)).toContain(eventSlug);
    expect(h!.indexable).toBe(true);
  });

  it('enforces edition↔event integrity', async () => {
    const ok = await rodeo.getPublicEditionBySlug(eventSlug, editionSlug);
    expect(ok).not.toBeNull();
    expect(ok!.datesKnown).toBe(true);
    expect(ok!.articles.map((a) => a.title)).toEqual(['Published rodeo dispatch']);
    // same edition slug but WRONG parent event → not found
    const wrong = await rodeo.getPublicEditionBySlug('no-such-event', editionSlug);
    expect(wrong).toBeNull();
  });

  it('resolves hub-or-event by slug with event precedence', async () => {
    expect(await rodeo.resolveRodeoEntity(eventSlug)).toEqual({ kind: 'event', slug: eventSlug });
    expect(await rodeo.resolveRodeoEntity(hubSlug)).toEqual({ kind: 'hub', slug: hubSlug });
    expect(await rodeo.resolveRodeoEntity(`nope-${tag}`)).toBeNull();
  });

  it('enforces cross-table slug uniqueness (hub vs event)', async () => {
    const name = `Collide ${TOKEN} ${tag}`;
    const hub = await rodeoSvc.createHub(adminActor, { title: name });
    extraHubIds.push(hub.id);
    // an event with the same name → same slug → must be rejected
    await expect(rodeoSvc.createEvent(adminActor, { name })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('includes rodeo entities in public search', async () => {
    const r = await search.runPublicSearch({ q: TOKEN, type: 'rodeo' });
    const urls = r.rodeo.map((x) => x.url);
    expect(urls).toContain(`/rodeo-events/${eventSlug}/`);
    expect(r.rodeo.some((x) => x.analyticsEntityType === 'RODEO_EVENT')).toBe(true);
  });
});
