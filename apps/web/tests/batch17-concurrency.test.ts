import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as Svc from '../lib/cms/competitionService';
import type * as RodeoSvc from '../lib/cms/rodeoService';
import type * as CompSvc from '../lib/cms/competitorService';

/**
 * Batch 17 §A — optimistic concurrency for competition coverage.
 * Verifies that a version-guarded update increments exactly once, that a stale
 * version is rejected as a conflict (no silent overwrite), that two concurrent
 * editors cannot both win, and that the correction lineage is unaffected.
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

suite('Batch 17 — competition optimistic concurrency', () => {
  const tag = rid();
  const userIds: string[] = [];
  let admin: Actor; let author: Actor;
  let eventId = ''; let editionId = '';
  let disciplineId = ''; let competitorId = '';

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({ data: { email: `b17-${roleKey}-${tag}-${rid()}@example.com`, name: `B17 ${roleKey}`, status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    userIds.push(u.id); return { id: u.id, roles: [roleKey] };
  }

  beforeAll(async () => {
    admin = await makeUser('administrator');
    author = await makeUser('author');
    const ev = await rodeo.createEvent(admin, { name: `B17 Event ${tag}` }); eventId = ev.id;
    editionId = (await rodeo.createEdition(admin, { eventId, editionSlug: `e-${tag}`, label: `E ${tag}` })).id;
    disciplineId = (await prisma.discipline.findFirstOrThrow({ select: { id: true } })).id;
    const c = await comp.createCompetitor(admin, { fullName: `B17 Cowboy ${tag}` }); competitorId = c.id;
    await comp.addCompetitorParticipation(admin, competitorId, { editionId });
  });

  afterAll(async () => {
    if (!available) return;
    await prisma.competitionResult.deleteMany({ where: { editionId } }).catch(() => {});
    await prisma.competitionStanding.deleteMany({ where: { editionId } }).catch(() => {});
    await prisma.competitionSession.deleteMany({ where: { editionId } }).catch(() => {});
    await prisma.competitor.delete({ where: { id: competitorId } }).catch(() => {});
    await prisma.rodeoEventEdition.deleteMany({ where: { eventId } }).catch(() => {});
    await prisma.rodeoEvent.delete({ where: { id: eventId } }).catch(() => {});
    for (const id of userIds) { await prisma.userRole.deleteMany({ where: { userId: id } }).catch(() => {}); await prisma.user.delete({ where: { id } }).catch(() => {}); }
  });

  const sessVersion = (id: string) => prisma.competitionSession.findUniqueOrThrow({ where: { id }, select: { version: true } }).then((r) => r.version);

  it('new records start at version 1', async () => {
    const s = await svc.createSession(admin, { editionId, title: `S ${tag}`, sessionType: 'perf' });
    expect(await sessVersion(s.id)).toBe(1);
  });

  it('a matching-version update succeeds and increments the version exactly once', async () => {
    const s = await svc.createSession(admin, { editionId, title: `S2 ${tag}`, sessionType: 'perf' });
    const before = await sessVersion(s.id);
    const res = await svc.updateSession(admin, s.id, { title: `S2 edited ${tag}`, sessionType: 'perf' }, before);
    expect(res.version).toBe(before + 1);
    expect(await sessVersion(s.id)).toBe(before + 1);
    expect((await prisma.competitionSession.findUniqueOrThrow({ where: { id: s.id } })).title).toBe(`S2 edited ${tag}`);
  });

  it('a stale version is rejected as a conflict and does NOT overwrite', async () => {
    const s = await svc.createSession(admin, { editionId, title: `orig ${tag}`, sessionType: 'perf' });
    const stale = await sessVersion(s.id); // 1
    // First editor saves with the loaded version → wins.
    await svc.updateSession(admin, s.id, { title: `winner ${tag}`, sessionType: 'perf' }, stale);
    // Second editor still holds the stale version → must conflict, leaving the winner's data intact.
    await expect(svc.updateSession(admin, s.id, { title: `loser ${tag}`, sessionType: 'perf' }, stale))
      .rejects.toMatchObject({ code: 'conflict' });
    const row = await prisma.competitionSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.title).toBe(`winner ${tag}`); // no silent overwrite
    expect(row.version).toBe(stale + 1); // only one increment happened
  });

  it('two concurrent editors with the same loaded version: exactly one wins', async () => {
    const s = await svc.createSession(admin, { editionId, title: `race ${tag}`, sessionType: 'perf' });
    const v = await sessVersion(s.id);
    const results = await Promise.allSettled([
      svc.updateSession(admin, s.id, { title: `A ${tag}`, sessionType: 'perf' }, v),
      svc.updateSession(admin, s.id, { title: `B ${tag}`, sessionType: 'perf' }, v),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const conflicts = results.filter((r) => r.status === 'rejected' && (r.reason as { code?: string })?.code === 'conflict');
    expect(ok.length).toBe(1);
    expect(conflicts.length).toBe(1);
    expect(await sessVersion(s.id)).toBe(v + 1); // only the winner incremented
  });

  it('rejects a missing / invalid / negative / non-integer expected version (no bypass)', async () => {
    const s = await svc.createSession(admin, { editionId, title: `inv ${tag}`, sessionType: 'perf' });
    const payload = { title: `inv edited ${tag}`, sessionType: 'perf' };
    for (const bad of [undefined, NaN, 0, -1, 1.5]) {
      await expect(svc.updateSession(admin, s.id, payload, bad as unknown as number)).rejects.toMatchObject({ code: 'validation' });
    }
    // Record is untouched — no silent bypass occurred.
    const row = await prisma.competitionSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.version).toBe(1);
    expect(row.title).toBe(`inv ${tag}`);
  });

  it('results and standings enforce the same version guard', async () => {
    const r = await svc.createResult(admin, { editionId, disciplineId, competitorId, resultType: 'TIME', timeSeconds: '8.10' });
    const rv = (await prisma.competitionResult.findUniqueOrThrow({ where: { id: r.id }, select: { version: true } })).version;
    const upd = await svc.updateResult(admin, r.id, { disciplineId, competitorId, resultType: 'TIME', timeSeconds: '8.05' }, rv);
    expect(upd.version).toBe(rv + 1);
    await expect(svc.updateResult(admin, r.id, { disciplineId, competitorId, resultType: 'TIME', timeSeconds: '9.99' }, rv))
      .rejects.toMatchObject({ code: 'conflict' });

    const st = await svc.createStanding(admin, { editionId, category: 'AGGREGATE', competitorId, aggregateValue: '10.0' });
    const sv = (await prisma.competitionStanding.findUniqueOrThrow({ where: { id: st.id }, select: { version: true } })).version;
    const supd = await svc.updateStanding(admin, st.id, { category: 'AGGREGATE', competitorId, aggregateValue: '11.0' }, sv);
    expect(supd.version).toBe(sv + 1);
    await expect(svc.updateStanding(admin, st.id, { category: 'AGGREGATE', competitorId, aggregateValue: '12.0' }, sv))
      .rejects.toMatchObject({ code: 'conflict' });
  });

  it('the correction lineage is unaffected by versioning (append + archive, not overwrite)', async () => {
    const orig = await svc.createResult(admin, { editionId, disciplineId, competitorId, resultType: 'TIME', timeSeconds: '9.00' });
    const corr = await svc.correctResult(admin, orig.id, { disciplineId, competitorId, resultType: 'TIME', timeSeconds: '8.80' });
    expect((await prisma.competitionResult.findUniqueOrThrow({ where: { id: orig.id } })).coverageStatus).toBe('ARCHIVED');
    expect((await prisma.competitionResult.findUniqueOrThrow({ where: { id: corr.id } })).correctionOfId).toBe(orig.id);
  });

  it('RBAC: a non-manager cannot update (forbidden, not conflict)', async () => {
    const s = await svc.createSession(admin, { editionId, title: `rbac ${tag}`, sessionType: 'perf' });
    const v = await sessVersion(s.id);
    await expect(svc.updateSession(author, s.id, { title: 'nope', sessionType: 'perf' }, v))
      .rejects.toMatchObject({ code: 'forbidden' });
  });
});
