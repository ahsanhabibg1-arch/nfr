import { describe, it, expect, afterAll, beforeAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { SectionSlot } from '../lib/cms/sectionRegistry';

/**
 * Stage 09 continuation — Task L mutation follow-up (M04).
 *
 * The controlled mutation run removed `scheduledAt: { not: null }` from the
 * claim guard in `executeScheduledPublish` and NO test failed. The reason is
 * that the guard has two halves and every service write clears both columns
 * together, so the other half (`scheduledSections: { not: Prisma.AnyNull }`)
 * always rejected the second claim on its own.
 *
 * That left the `scheduledAt` half unproven. This test pins it with the one
 * state that separates the two halves: a runner holding a STALE snapshot of a
 * due layout, whose `scheduledAt` has since been cleared while
 * `scheduledSections` was left behind (a partial clear — a manual DB repair, a
 * legacy row, or a future code path that clears only the time). A schedule
 * with no time is not due, so it must not publish.
 *
 * DATABASE: isolated test database only; rows are removed in afterAll.
 */

const TEST_KEY = 'section:rodeo-events';

let available = false;
let prisma: PrismaClient;
let svc: typeof import('../lib/cms/pageLayoutService');
const ACTOR: { id: string; roles: never } = { id: '', roles: ['super_admin'] as never };
let actorUserId = '';

if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.pageLayout.findFirst();
    svc = await import('../lib/cms/pageLayoutService');
    available = true;
  } catch {
    available = false;
  }
}

const slot = (title: string): SectionSlot => ({ id: 's09g-1', sectionType: 'rich-text-block', visible: true, order: 0, props: { title, body: 'b' } });

async function reset(): Promise<void> {
  await prisma.pageLayoutRevision.deleteMany({ where: { pageKey: TEST_KEY } });
  await prisma.pageLayout.deleteMany({ where: { pageKey: TEST_KEY } });
}

if (available) {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `stage09guard-${Date.now()}@example.com`, name: 'Stage09 Guard', status: 'ACTIVE' } });
    ACTOR.id = u.id as never;
    actorUserId = u.id;
  });
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    await prisma.auditLog.deleteMany({ where: { actorId: actorUserId } });
    await prisma.user.deleteMany({ where: { id: actorUserId } });
  });
}

describe.runIf(available)('Stage 09 Task L — the scheduledAt half of the claim guard', () => {
  it('a stale runner cannot publish a schedule whose time was cleared, even if its sections remain', async () => {
    await svc.saveDraft(ACTOR, { pageKey: TEST_KEY, sections: [slot('SCHEDULED CONTENT')], expectedVersion: 0 });
    await svc.schedulePublish(ACTOR, TEST_KEY, new Date(Date.now() + 3_600_000));
    await prisma.pageLayout.update({ where: { pageKey: TEST_KEY }, data: { scheduledAt: new Date(Date.now() - 60_000) } });

    // The runner reads the due layout…
    const [stale] = (await svc.getDueSchedules()).filter((l) => l.pageKey === TEST_KEY);
    expect(stale, 'the layout was due when the runner read it').toBeDefined();

    // …and before it claims, the TIME is cleared but the sections are not.
    await prisma.pageLayout.update({ where: { pageKey: TEST_KEY }, data: { scheduledAt: null } });
    const before = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    expect(before.scheduledSections, 'precondition: sections still present').not.toBeNull();

    const result = await svc.executeScheduledPublish(stale);

    expect(result, 'an un-timed schedule must not be claimed').toBeNull();
    const after = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    expect(JSON.stringify(after.publishedSections)).not.toContain('SCHEDULED CONTENT');
    expect(after.version, 'nothing was written').toBe(before.version);
    expect(await prisma.pageLayoutRevision.count({ where: { pageKey: TEST_KEY } }), 'no revision recorded').toBe(0);
  });
});
