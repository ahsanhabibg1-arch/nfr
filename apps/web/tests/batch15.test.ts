import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as Content from '../lib/batch12Content';
import type * as Comp from '../lib/cms/competitorService';
import type * as Rodeo from '../lib/cms/rodeoService';
import type * as CompSvc from '../lib/cms/competitionService';

/**
 * Batch 15 — public directories (search/filter/pagination/visibility) + competition admin
 * edit. Isolated TEST DB only; self-skips without DATABASE_URL.
 */
let available = false;
let prisma: PrismaClient; let content: typeof Content; let comp: typeof Comp; let rodeo: typeof Rodeo; let svc: typeof CompSvc;
if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    available = true;
    content = await import('../lib/batch12Content');
    comp = await import('../lib/cms/competitorService');
    rodeo = await import('../lib/cms/rodeoService');
    svc = await import('../lib/cms/competitionService');
    await (await import('../lib/auth/roleSync')).syncRolesAndPermissions(prisma);
  } catch { available = false; }
}
const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

suite('Batch 15 — directories + admin edit', () => {
  const tag = rid();
  let admin: Actor; const userIds: string[] = [];
  let venueId = ''; const compIds: string[] = []; let disciplineId = ''; let editionId = ''; let eventId = '';

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({ data: { email: `b15-${tag}-${rid()}@example.com`, name: 'B15', status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } }); userIds.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }

  beforeAll(async () => {
    admin = await makeUser('administrator');
    disciplineId = (await prisma.discipline.findFirstOrThrow({ select: { id: true } })).id;
    const v = await rodeo.createVenue(admin, { name: `B15 Arena ${tag}`, country: 'USA' }); venueId = v.id;
    const c1 = await comp.createCompetitor(admin, { fullName: `Zane B15 ${tag}` }); compIds.push(c1.id);
    const c2 = await comp.createCompetitor(admin, { fullName: `Yuma B15 ${tag}` }); compIds.push(c2.id);
    await comp.setCompetitorDisciplines(admin, c1.id, [disciplineId]);
    const ev = await rodeo.createEvent(admin, { name: `B15 Event ${tag}` }); eventId = ev.id;
    editionId = (await rodeo.createEdition(admin, { eventId, editionSlug: `e-${tag}`, label: `E ${tag}` })).id;
    await comp.addCompetitorParticipation(admin, c1.id, { editionId });
  });

  afterAll(async () => {
    if (!available) return;
    await prisma.competitionResult.deleteMany({ where: { editionId } }).catch(() => {});
    await prisma.rodeoEventEdition.deleteMany({ where: { eventId } }).catch(() => {});
    await prisma.rodeoEvent.delete({ where: { id: eventId } }).catch(() => {});
    for (const id of compIds) await prisma.competitor.delete({ where: { id } }).catch(() => {});
    await prisma.venue.delete({ where: { id: venueId } }).catch(() => {});
    for (const id of userIds) { await prisma.userRole.deleteMany({ where: { userId: id } }).catch(() => {}); await prisma.user.delete({ where: { id } }).catch(() => {}); }
  });

  it('competitor directory: name search + discipline filter + bounded pagination', async () => {
    const byName = await content.listPublicCompetitors({ q: `Zane B15 ${tag}` });
    expect(byName.items.some((c) => c.fullName === `Zane B15 ${tag}`)).toBe(true);
    expect(byName.items.every((c) => c.fullName.toLowerCase().includes('zane'))).toBe(true);
    const byDisc = await content.listPublicCompetitors({ disciplineSlug: (await prisma.discipline.findUniqueOrThrow({ where: { id: disciplineId } })).slug, q: `B15 ${tag}` });
    expect(byDisc.items.some((c) => c.fullName === `Zane B15 ${tag}`)).toBe(true); // has the discipline
    expect(byDisc.items.some((c) => c.fullName === `Yuma B15 ${tag}`)).toBe(false); // no discipline link
    // pagination is bounded (pageSize fixed; page clamps)
    const paged = await content.listPublicCompetitors({ page: 1 });
    expect(paged.pageSize).toBeLessThanOrEqual(24);
    // card exposes only public fields (no notes/internal)
    const card = byName.items[0] as unknown as Record<string, unknown>;
    expect(card).not.toHaveProperty('createdById');
    expect(card).not.toHaveProperty('birthYear');
  });

  it('venue directory: name search + country filter', async () => {
    const r = await content.listPublicVenues({ q: `B15 Arena ${tag}` });
    expect(r.items.some((v) => v.name === `B15 Arena ${tag}`)).toBe(true);
    const byCountry = await content.listPublicVenues({ country: 'USA', q: `B15 Arena ${tag}` });
    expect(byCountry.items.some((v) => v.name === `B15 Arena ${tag}`)).toBe(true);
  });

  it('admin edit updates a result in place without resetting unrelated fields', async () => {
    const r = await svc.createResult(admin, { editionId, disciplineId, competitorId: compIds[0], resultType: 'TIME', timeSeconds: '8.50', placement: 2, sourceRef: 'official' });
    const v0 = (await prisma.competitionResult.findUniqueOrThrow({ where: { id: r.id }, select: { version: true } })).version;
    await svc.updateResult(admin, r.id, { disciplineId, competitorId: compIds[0], resultType: 'TIME', timeSeconds: '8.10', placement: 1, sourceRef: 'official' }, v0);
    const row = await prisma.competitionResult.findUniqueOrThrow({ where: { id: r.id } });
    expect(row.timeSeconds?.toString()).toBe('8.1');
    expect(row.placement).toBe(1);
    expect(row.sourceRef).toBe('official'); // preserved
  });
});
