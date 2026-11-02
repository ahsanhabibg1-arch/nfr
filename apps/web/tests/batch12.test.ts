import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as CompetitorSvc from '../lib/cms/competitorService';
import type * as RodeoSvc from '../lib/cms/rodeoService';
import type * as SeoSvc from '../lib/cms/entitySeoService';
import type * as Batch12Content from '../lib/batch12Content';

/**
 * Batch 12 — venue & competitor integration (CRUD, edition-level participation,
 * discipline/article links, polymorphic SEO reuse, indexability, reference-safe
 * deletion, authorization). Self-skips without DATABASE_URL.
 */
let available = false;
let prisma: PrismaClient;
let comp: typeof CompetitorSvc;
let rodeoSvc: typeof RodeoSvc;
let seo: typeof SeoSvc;
let content: typeof Batch12Content;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    available = true;
    comp = await import('../lib/cms/competitorService');
    rodeoSvc = await import('../lib/cms/rodeoService');
    seo = await import('../lib/cms/entitySeoService');
    content = await import('../lib/batch12Content');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
  } catch {
    available = false;
  }
}
const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

suite('Batch 12 — venues & competitors', () => {
  const tag = rid();
  const userIds: string[] = [];
  let admin: Actor;
  let author: Actor;
  let eventId = '';
  let editionId = '';
  let venueId = '';
  let competitorId = '';
  let disciplineId = '';

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({ data: { email: `b12-${roleKey}-${tag}-${rid()}@example.com`, name: `B12 ${roleKey}`, status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    userIds.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }

  beforeAll(async () => {
    admin = await makeUser('administrator'); // has rodeo.manage
    author = await makeUser('author'); // has neither
    const ev = await rodeoSvc.createEvent(admin, { name: `B12 Event ${tag}` });
    eventId = ev.id;
    const ed = await rodeoSvc.createEdition(admin, { eventId, editionSlug: `2025-${tag}`, label: `2025 ${tag}` });
    editionId = ed.id;
    const d = await prisma.discipline.findFirst({ select: { id: true } });
    disciplineId = d?.id ?? '';
  });

  afterAll(async () => {
    if (!available) return;
    if (competitorId) {
      await prisma.entitySeo.deleteMany({ where: { entityType: 'COMPETITOR', entityId: competitorId } }).catch(() => {});
      await prisma.competitor.delete({ where: { id: competitorId } }).catch(() => {});
    }
    if (venueId) {
      await prisma.entitySeo.deleteMany({ where: { entityType: 'VENUE', entityId: venueId } }).catch(() => {});
      await prisma.venue.delete({ where: { id: venueId } }).catch(() => {});
    }
    await prisma.rodeoEventEdition.delete({ where: { id: editionId } }).catch(() => {});
    await prisma.rodeoEvent.delete({ where: { id: eventId } }).catch(() => {});
    for (const id of userIds) {
      await prisma.userRole.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
  });

  it('creates a venue with validated rich fields; author is forbidden', async () => {
    await expect(rodeoSvc.createVenue(author, { name: `Nope ${tag}` })).rejects.toMatchObject({ code: 'forbidden' });
    const v = await rodeoSvc.createVenue(admin, { name: `B12 Arena ${tag}`, city: 'Las Vegas', state: 'NV', country: 'USA', capacity: 18000, openedYear: 1983, latitude: 36.1, longitude: -115.1, summary: 'A verified test arena.' });
    venueId = v.id;
    const row = await prisma.venue.findUniqueOrThrow({ where: { id: venueId } });
    expect(row.capacity).toBe(18000);
    expect(row.openedYear).toBe(1983);
    expect(row.summary).toBe('A verified test arena.');
  });

  it('rejects an invalid website URL and out-of-range opened year', async () => {
    await expect(rodeoSvc.createVenue(admin, { name: `Bad URL ${tag}`, websiteUrl: 'not-a-url' })).rejects.toBeTruthy();
    await expect(rodeoSvc.createVenue(admin, { name: `Bad Year ${tag}`, openedYear: 1700 })).rejects.toBeTruthy();
  });

  it('links the edition to the venue and surfaces it on the public venue page', async () => {
    await rodeoSvc.updateEdition(admin, editionId, { label: `2025 ${tag}`, venueId });
    const pub = await content.getPublicVenueBySlug((await prisma.venue.findUniqueOrThrow({ where: { id: venueId } })).slug);
    expect(pub?.editions.some((e) => e.editionSlug === `2025-${tag}`)).toBe(true);
    expect(pub?.indexable).toBe(true);
  });

  it('creates a competitor; forbids author; enforces unique slug', async () => {
    await expect(comp.createCompetitor(author, { fullName: `No One ${tag}` })).rejects.toMatchObject({ code: 'forbidden' });
    const c = await comp.createCompetitor(admin, { fullName: `Test Cowboy ${tag}`, summary: 'A verified test competitor.', status: 'active' });
    competitorId = c.id;
    await expect(comp.createCompetitor(admin, { fullName: `Test Cowboy ${tag}` })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('sets disciplines and edition-level participation (not the recurring event)', async () => {
    if (disciplineId) {
      await comp.setCompetitorDisciplines(admin, competitorId, [disciplineId]);
      await expect(comp.setCompetitorDisciplines(admin, competitorId, ['missing-discipline'])).rejects.toMatchObject({ code: 'validation' });
    }
    await comp.addCompetitorParticipation(admin, competitorId, { editionId, placement: 1, result: 'Champion' });
    await expect(comp.addCompetitorParticipation(admin, competitorId, { editionId: 'missing-edition' })).rejects.toMatchObject({ code: 'validation' });
    const detail = await comp.getCompetitorDetail(admin, competitorId);
    expect(detail.participations.length).toBe(1);
    expect(detail.participations[0].editionId).toBe(editionId);
  });

  it('reuses EntitySeo for competitors with additive-only noindex', async () => {
    const row = await seo.upsertEntitySeo(admin, 'COMPETITOR', competitorId, { seoTitle: 'Custom', noindex: true });
    expect(row.seoTitle).toBe('Custom');
    await expect(seo.upsertEntitySeo(author, 'COMPETITOR', competitorId, { noindex: false })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(seo.upsertEntitySeo(admin, 'COMPETITOR', `missing-${tag}`, { noindex: false })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('public competitor read reflects disciplines, participation and indexability', async () => {
    const slug = (await prisma.competitor.findUniqueOrThrow({ where: { id: competitorId } })).slug;
    const pub = await content.getPublicCompetitorBySlug(slug);
    expect(pub?.indexable).toBe(true);
    expect(pub?.participations.length).toBe(1);
    if (disciplineId) expect(pub?.disciplines.length).toBe(1);
  });

  it('deletes competitor and cleans up its SEO rows (no orphans); cascades junctions', async () => {
    const id = competitorId;
    await comp.deleteCompetitor(admin, id);
    competitorId = '';
    expect(await prisma.competitor.count({ where: { id } })).toBe(0);
    expect(await prisma.entitySeo.count({ where: { entityType: 'COMPETITOR', entityId: id } })).toBe(0);
    expect(await prisma.competitorParticipation.count({ where: { competitorId: id } })).toBe(0);
    expect(await prisma.competitorDiscipline.count({ where: { competitorId: id } })).toBe(0);
  });
});
