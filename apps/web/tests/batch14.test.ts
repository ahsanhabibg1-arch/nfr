import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as Svc from '../lib/cms/competitionService';
import type * as RodeoSvc from '../lib/cms/rodeoService';
import type * as CompSvc from '../lib/cms/competitorService';

/**
 * Batch 14 — competition coverage integration: edition-scoped sessions/results/standings,
 * verification + publication gates, cross-edition rejection, public filtering, security.
 * Self-skips without DATABASE_URL. Isolated TEST DB only.
 */
let available = false;
let prisma: PrismaClient;
let svc: typeof Svc; let rodeo: typeof RodeoSvc; let comp: typeof CompSvc;

if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    available = true;
    svc = await import('../lib/cms/competitionService');
    rodeo = await import('../lib/cms/rodeoService');
    comp = await import('../lib/cms/competitorService');
    await (await import('../lib/auth/roleSync')).syncRolesAndPermissions(prisma);
  } catch { available = false; }
}
const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

suite('Batch 14 — competition coverage', () => {
  const tag = rid();
  const userIds: string[] = [];
  let admin: Actor; let author: Actor;
  let eventId = ''; let editionAId = ''; let editionBId = '';
  let disciplineId = ''; let competitorId = ''; let outsiderId = '';

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({ data: { email: `b14-${roleKey}-${tag}-${rid()}@example.com`, name: `B14 ${roleKey}`, status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    userIds.push(u.id); return { id: u.id, roles: [roleKey] };
  }

  beforeAll(async () => {
    admin = await makeUser('administrator');
    author = await makeUser('author');
    const ev = await rodeo.createEvent(admin, { name: `B14 Event ${tag}` }); eventId = ev.id;
    editionAId = (await rodeo.createEdition(admin, { eventId, editionSlug: `a-${tag}`, label: `A ${tag}` })).id;
    editionBId = (await rodeo.createEdition(admin, { eventId, editionSlug: `b-${tag}`, label: `B ${tag}` })).id;
    disciplineId = (await prisma.discipline.findFirstOrThrow({ select: { id: true } })).id;
    const c = await comp.createCompetitor(admin, { fullName: `B14 Cowboy ${tag}` }); competitorId = c.id;
    const o = await comp.createCompetitor(admin, { fullName: `B14 Outsider ${tag}` }); outsiderId = o.id;
    // competitor participates in edition A only (eligibility); outsider participates nowhere here.
    await comp.addCompetitorParticipation(admin, competitorId, { editionId: editionAId });
  });

  afterAll(async () => {
    if (!available) return;
    await prisma.competitionResult.deleteMany({ where: { editionId: { in: [editionAId, editionBId] } } }).catch(() => {});
    await prisma.competitionStanding.deleteMany({ where: { editionId: { in: [editionAId, editionBId] } } }).catch(() => {});
    await prisma.competitionSession.deleteMany({ where: { editionId: { in: [editionAId, editionBId] } } }).catch(() => {});
    for (const id of [competitorId, outsiderId]) await prisma.competitor.delete({ where: { id } }).catch(() => {});
    await prisma.rodeoEventEdition.deleteMany({ where: { eventId } }).catch(() => {});
    await prisma.rodeoEvent.delete({ where: { id: eventId } }).catch(() => {});
    for (const id of userIds) { await prisma.userRole.deleteMany({ where: { userId: id } }).catch(() => {}); await prisma.user.delete({ where: { id } }).catch(() => {}); }
  });

  it('schedule: create needs rodeo.manage; publish is gated by verification', async () => {
    await expect(svc.createSession(author, { editionId: editionAId, title: 'X', sessionType: 'perf' })).rejects.toMatchObject({ code: 'forbidden' });
    const s = await svc.createSession(admin, { editionId: editionAId, title: `Round 1 ${tag}`, sessionType: 'performance', disciplineId, roundNumber: 1, startAt: new Date('2026-12-03T19:00:00Z').toISOString(), timezone: 'America/Los_Angeles' });
    // cannot publish before verifying
    await expect(svc.setCoverageStatus(admin, 'session', s.id, 'PUBLISHED')).rejects.toMatchObject({ code: 'validation' });
    expect((await svc.getPublicSchedule(editionAId)).length).toBe(0);
    await svc.setVerification(admin, 'session', s.id, 'VERIFIED');
    await svc.setCoverageStatus(admin, 'session', s.id, 'PUBLISHED');
    const pub = await svc.getPublicSchedule(editionAId);
    expect(pub.map((p) => p.id)).toContain(s.id);
  });

  it('results: TIME needs a time; NO_TIME allowed empty; wrong-edition competitor + session rejected', async () => {
    await expect(svc.createResult(admin, { editionId: editionAId, disciplineId, competitorId, resultType: 'TIME' })).rejects.toMatchObject({ code: 'validation' }); // TIME without time
    // outsider has no participation in edition A → cross-edition/eligibility rejection
    await expect(svc.createResult(admin, { editionId: editionAId, disciplineId, competitorId: outsiderId, resultType: 'NO_TIME' })).rejects.toMatchObject({ code: 'validation' });
    // a session created in edition B cannot be referenced by an edition-A result
    const sB = await svc.createSession(admin, { editionId: editionBId, title: 'B sess', sessionType: 'perf' });
    await expect(svc.createResult(admin, { editionId: editionAId, disciplineId, competitorId, resultType: 'NO_TIME', sessionId: sB.id })).rejects.toMatchObject({ code: 'validation' });

    const ok = await svc.createResult(admin, { editionId: editionAId, disciplineId, competitorId, resultType: 'TIME', timeSeconds: '8.21', placement: 1 });
    const noTime = await svc.createResult(admin, { editionId: editionAId, disciplineId, competitorId, resultType: 'NO_TIME' });
    expect(ok.id).toBeTruthy(); expect(noTime.id).toBeTruthy();
    // not public until verified+published
    expect((await svc.getPublicResults(editionAId)).length).toBe(0);
    for (const id of [ok.id, noTime.id]) { await svc.setVerification(admin, 'result', id, 'VERIFIED'); await svc.setCoverageStatus(admin, 'result', id, 'PUBLISHED'); }
    const pub = await svc.getPublicResults(editionAId);
    expect(pub.length).toBe(2);
    expect(pub.find((r) => r.id === ok.id)?.timeSeconds).toBe('8.21'); // decimal preserved as string
  });

  it('correction archives the original and links the new result', async () => {
    const orig = await svc.createResult(admin, { editionId: editionAId, disciplineId, competitorId, resultType: 'TIME', timeSeconds: '9.00' });
    const corr = await svc.correctResult(admin, orig.id, { disciplineId, competitorId, resultType: 'TIME', timeSeconds: '8.95' });
    expect((await prisma.competitionResult.findUniqueOrThrow({ where: { id: orig.id } })).coverageStatus).toBe('ARCHIVED');
    expect((await prisma.competitionResult.findUniqueOrThrow({ where: { id: corr.id } })).correctionOfId).toBe(orig.id);
  });

  it('standings: created, verified+published, visible publicly; unverified hidden', async () => {
    const st = await svc.createStanding(admin, { editionId: editionAId, category: 'AGGREGATE', disciplineId, competitorId, rankPosition: 1, aggregateValue: '17.21', earnings: '26500.00' });
    expect((await svc.getPublicStandings(editionAId)).length).toBe(0); // unverified
    await svc.setVerification(admin, 'standing', st.id, 'VERIFIED');
    await svc.setCoverageStatus(admin, 'standing', st.id, 'PUBLISHED');
    const pub = await svc.getPublicStandings(editionAId);
    expect(pub.find((s) => s.id === st.id)?.earnings).toBe('26500'); // canonical decimal (value 26500.00)
    // un-verifying a published record pulls it back out of public view
    await svc.setVerification(admin, 'standing', st.id, 'CORRECTION_REQUIRED');
    expect((await svc.getPublicStandings(editionAId)).find((s) => s.id === st.id)).toBeUndefined();
  });
});
