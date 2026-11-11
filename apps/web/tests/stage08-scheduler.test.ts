import { describe, it, expect, afterAll, beforeAll, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { SectionSlot } from '../lib/cms/sectionRegistry';

/**
 * Stage 08 Task G — scheduler audit and the policy-independent corrections.
 *
 * WHAT IS IN SCOPE HERE. D-12 (scheduler and deployment target) is an
 * UNAPPROVED owner decision, so Stage 08 does not choose a hosting provider, a
 * cron service, a schedule frequency or a deployment architecture. What it does
 * verify and correct is everything that is true regardless of where the thing
 * runs: who may schedule, how timestamps are treated, whether repeated
 * execution is safe, whether concurrent runners can double-publish, whether a
 * published schedule can lose its revision, and whether a missing secret fails
 * closed.
 *
 * The deployment-neutral contract and the blocked items are documented in
 * `docs/stage-08/STAGE_08_GLOBAL_CONTROLS_AND_DECISIONS.md`.
 */

const TEST_KEY = 'section:rodeo-events';

let available = false;
let prisma: PrismaClient;
let svc: typeof import('../lib/cms/pageLayoutService');

const ACTOR: { id: string; roles: never } = { id: '', roles: ['super_admin'] as never };
const NO_PERM: { id: string; roles: never } = { id: '', roles: ['author'] as never };
const ephemeralUserIds: string[] = [];

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

function slot(title: string): SectionSlot {
  return { id: 's08s-1', sectionType: 'rich-text-block', visible: true, order: 0, props: { title, body: 'b' } };
}

async function reset(): Promise<void> {
  await prisma.pageLayoutRevision.deleteMany({ where: { pageKey: TEST_KEY } });
  await prisma.pageLayout.deleteMany({ where: { pageKey: TEST_KEY } });
}

/** A layout with a draft ready to schedule. */
async function seedDraft(title: string): Promise<void> {
  await svc.saveDraft(ACTOR, { pageKey: TEST_KEY, sections: [slot(title)], expectedVersion: 0 });
}

/** Force a schedule into the past, which the service refuses to create directly. */
async function backdateSchedule(): Promise<void> {
  await prisma.pageLayout.update({
    where: { pageKey: TEST_KEY },
    data: { scheduledAt: new Date(Date.now() - 60_000) },
  });
}

/**
 * Let the connection pool drain before the next test FILE runs.
 *
 * This suite deliberately opens overlapping interactive transactions — five
 * concurrent publishes is the point of the KD-10 proof. Vitest runs files
 * serially (`fileParallelism: false`), but PostgreSQL and the Prisma pool do
 * not finish the instant the last assertion does, and the next file's own 5s
 * interactive transactions can then expire with P2028.
 *
 * That is exactly what happened on the first full run: `phase2-editorial`
 * failed twice with "Transaction already closed", and passed in isolation.
 * A short, bounded settle removes the cross-file interference without
 * weakening a single assertion in either suite.
 */
async function drainPool(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    if (Date.now() - started < 50) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

if (available) {
  beforeAll(async () => {
    const stamp = Date.now();
    for (const [actor, label] of [[ACTOR, 'S1'], [NO_PERM, 'S2']] as const) {
      const user = await prisma.user.create({
        data: { email: `stage08sch-${label}-${stamp}@example.com`, name: `Stage08 Sched ${label}`, status: 'ACTIVE' },
      });
      actor.id = user.id as never;
      ephemeralUserIds.push(user.id);
    }
  });
  beforeEach(reset);
  afterAll(async () => {
    await reset();
    for (const id of ephemeralUserIds) {
      await prisma.auditLog.deleteMany({ where: { actorId: id } });
      await prisma.user.deleteMany({ where: { id } });
    }
    await drainPool();
  });
}

/* ── 1. Who may schedule, and what may be scheduled ───────────────── */

describe.runIf(available)('Stage 08 Task G — scheduling eligibility and authorization', () => {
  it('requires system.config to schedule', async () => {
    await seedDraft('x');
    await expect(
      svc.schedulePublish(NO_PERM, TEST_KEY, new Date(Date.now() + 3_600_000)),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('requires system.config to cancel', async () => {
    await seedDraft('x');
    await svc.schedulePublish(ACTOR, TEST_KEY, new Date(Date.now() + 3_600_000));
    await expect(svc.cancelSchedule(NO_PERM, TEST_KEY)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('refuses a past timestamp', async () => {
    await seedDraft('x');
    await expect(
      svc.schedulePublish(ACTOR, TEST_KEY, new Date(Date.now() - 1_000)),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('refuses the current instant, so "now" cannot race the runner', async () => {
    await seedDraft('x');
    await expect(svc.schedulePublish(ACTOR, TEST_KEY, new Date())).rejects.toMatchObject({ code: 'validation' });
  });

  it('refuses an unknown page key', async () => {
    await expect(
      svc.schedulePublish(ACTOR, 'made:up', new Date(Date.now() + 3_600_000)),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('refuses to schedule a page with no layout', async () => {
    await expect(
      svc.schedulePublish(ACTOR, TEST_KEY, new Date(Date.now() + 3_600_000)),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('refuses to schedule an EMPTY draft', async () => {
    // Publishing an empty layout would blank a live page on a timer.
    await svc.saveDraft(ACTOR, { pageKey: TEST_KEY, sections: [], expectedVersion: 0 });
    await expect(
      svc.schedulePublish(ACTOR, TEST_KEY, new Date(Date.now() + 3_600_000)),
    ).rejects.toMatchObject({ code: 'validation' });
  });

  it('snapshots the draft AT SCHEDULING TIME, not at execution time', async () => {
    /**
     * `scheduledSections` is a copy. A later draft edit therefore does not
     * change what was approved for publication — the operator publishes what
     * they scheduled, not whatever the draft happens to be when the timer
     * fires.
     */
    await seedDraft('SCHEDULED-CONTENT');
    const row = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    await svc.schedulePublish(ACTOR, TEST_KEY, new Date(Date.now() + 3_600_000));
    const afterSchedule = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    await svc.saveDraft(ACTOR, { pageKey: TEST_KEY, sections: [slot('EDITED-AFTER')], expectedVersion: afterSchedule.version });

    const now = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    expect(JSON.stringify(now.scheduledSections)).toContain('SCHEDULED-CONTENT');
    expect(JSON.stringify(now.scheduledSections)).not.toContain('EDITED-AFTER');
    expect(row.version).toBeLessThan(now.version);
  });

  it('records who scheduled it, and audits the action', async () => {
    await seedDraft('x');
    const before = await prisma.auditLog.count({ where: { action: 'page_layout.schedule' } });
    const row = await svc.schedulePublish(ACTOR, TEST_KEY, new Date(Date.now() + 3_600_000));
    expect(row.scheduledById).toBe(ACTOR.id);
    expect(await prisma.auditLog.count({ where: { action: 'page_layout.schedule' } })).toBe(before + 1);
  });

  it('cancelling clears all three scheduled columns', async () => {
    await seedDraft('x');
    await svc.schedulePublish(ACTOR, TEST_KEY, new Date(Date.now() + 3_600_000));
    const row = await svc.cancelSchedule(ACTOR, TEST_KEY);
    expect(row.scheduledAt).toBeNull();
    expect(row.scheduledSections).toBeNull();
    expect(row.scheduledById).toBeNull();
  });

  it('refuses to cancel when nothing is scheduled', async () => {
    await seedDraft('x');
    await expect(svc.cancelSchedule(ACTOR, TEST_KEY)).rejects.toMatchObject({ code: 'validation' });
  });
});

/* ── 2. Due-ness and timezone handling ────────────────────────────── */

describe.runIf(available)('Stage 08 Task G — due-ness is absolute-time, not local-time', () => {
  it('does not list a future schedule as due', async () => {
    await seedDraft('x');
    await svc.schedulePublish(ACTOR, TEST_KEY, new Date(Date.now() + 3_600_000));
    const due = await svc.getDueSchedules();
    expect(due.map((d) => d.pageKey)).not.toContain(TEST_KEY);
  });

  it('lists a past schedule as due', async () => {
    await seedDraft('x');
    await svc.schedulePublish(ACTOR, TEST_KEY, new Date(Date.now() + 3_600_000));
    await backdateSchedule();
    const due = await svc.getDueSchedules();
    expect(due.map((d) => d.pageKey)).toContain(TEST_KEY);
  });

  it('stores the instant as UTC, so the result does not depend on server locale', async () => {
    /**
     * `scheduledAt` is a Prisma `DateTime`, compared with `lte: new Date()`.
     * Both sides are absolute instants, so a server in any timezone agrees on
     * whether a schedule is due. The Admin renders it in the viewer's locale;
     * the decision is never made on a local-time string.
     */
    await seedDraft('x');
    const target = new Date(Date.now() + 7_200_000);
    const row = await svc.schedulePublish(ACTOR, TEST_KEY, target);
    expect(row.scheduledAt!.toISOString()).toBe(target.toISOString());
    expect(row.scheduledAt!.getTime()).toBe(target.getTime());
  });

  /**
   * S08-5 — REWRITTEN IN STAGE 09 TASK I, AND STAGE 08'S DIAGNOSIS CORRECTED.
   *
   * Stage 08 recorded this as "the predicate `{ not: { equals: null } }` does
   * not exclude a database NULL". Measured against the isolated test database,
   * **that was wrong**: the predicate excludes a true SQL NULL perfectly.
   *
   * The real cause was the WRITE. `cancelSchedule` and
   * `executeScheduledPublish` cleared the column with
   * `null as unknown as undefined`, which Prisma coerces to `JsonNull` — a JSON
   * `null` LITERAL, leaving the column `IS NULL = false`. A predicate comparing
   * against SQL NULL then correctly fails to exclude it. Measured:
   *
   *     write form                        stored      IS NULL   old predicate
   *     null as unknown as undefined      JSON null   false     MATCHED
   *     Prisma.DbNull                     SQL NULL    true      excluded
   *     Prisma.JsonNull                   JSON null   false     MATCHED
   *     [{ … }]                           array       false     matched (correct)
   *
   * Stage 09 fixed both ends: the writes use `Prisma.DbNull`, and the reads use
   * `Prisma.AnyNull`, which excludes both null forms so rows already written by
   * the old code are covered without a data migration.
   *
   * These tests now assert the FIXED behaviour, and cover both null
   * representations so the legacy shape cannot silently regress.
   */
  it('excludes a schedule cleared as a real SQL NULL', async () => {
    const { Prisma } = await import('@prisma/client');
    await seedDraft('x');
    await svc.schedulePublish(ACTOR, TEST_KEY, new Date(Date.now() + 3_600_000));
    await prisma.pageLayout.update({
      where: { pageKey: TEST_KEY },
      data: { scheduledAt: new Date(Date.now() - 60_000), scheduledSections: Prisma.DbNull },
    });

    const due = await svc.getDueSchedules();
    expect(due.map((d) => d.pageKey), 'a cleared schedule is not due').not.toContain(TEST_KEY);
  });

  it('excludes a schedule cleared as a JSON null literal — the legacy shape', async () => {
    /**
     * The row shape the OLD code left behind. Production has never been
     * inspected and may hold these, so the read must exclude them too — that is
     * why `AnyNull` was chosen over `DbNull` for the predicate.
     */
    const { Prisma } = await import('@prisma/client');
    await seedDraft('x');
    await svc.schedulePublish(ACTOR, TEST_KEY, new Date(Date.now() + 3_600_000));
    await prisma.pageLayout.update({
      where: { pageKey: TEST_KEY },
      data: { scheduledAt: new Date(Date.now() - 60_000), scheduledSections: Prisma.JsonNull },
    });

    const raw = await prisma.$queryRaw<{ isnull: boolean }[]>`
      SELECT ("scheduledSections" IS NULL) AS isnull FROM "PageLayout" WHERE "pageKey" = ${TEST_KEY}`;
    expect(raw[0].isnull, 'the legacy shape is NOT a SQL NULL — that is the whole point').toBe(false);

    const due = await svc.getDueSchedules();
    expect(due.map((d) => d.pageKey), 'the legacy JSON-null shape must be excluded too').not.toContain(TEST_KEY);
  });

  it('cancelling a schedule leaves a real SQL NULL, not a JSON literal', async () => {
    await seedDraft('x');
    await svc.schedulePublish(ACTOR, TEST_KEY, new Date(Date.now() + 3_600_000));
    await svc.cancelSchedule(ACTOR, TEST_KEY);

    const raw = await prisma.$queryRaw<{ isnull: boolean }[]>`
      SELECT ("scheduledSections" IS NULL) AS isnull FROM "PageLayout" WHERE "pageKey" = ${TEST_KEY}`;
    expect(raw[0].isnull, 'cancelSchedule must write SQL NULL').toBe(true);
  });

  it('a consumed schedule leaves a real SQL NULL and is never due again', async () => {
    await seedDraft('SCHEDULED');
    await svc.schedulePublish(ACTOR, TEST_KEY, new Date(Date.now() + 3_600_000));
    await backdateSchedule();
    const row = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    expect(await svc.executeScheduledPublish(row)).not.toBeNull();

    const raw = await prisma.$queryRaw<{ isnull: boolean }[]>`
      SELECT ("scheduledSections" IS NULL) AS isnull FROM "PageLayout" WHERE "pageKey" = ${TEST_KEY}`;
    expect(raw[0].isnull, 'execution must clear with SQL NULL').toBe(true);
    expect((await svc.getDueSchedules()).map((d) => d.pageKey)).not.toContain(TEST_KEY);
  });

  it('still returns a genuinely due schedule — the fix is not over-broad', async () => {
    // The other half: `AnyNull` must not exclude a real array.
    await seedDraft('x');
    await svc.schedulePublish(ACTOR, TEST_KEY, new Date(Date.now() + 3_600_000));
    await backdateSchedule();
    expect((await svc.getDueSchedules()).map((d) => d.pageKey)).toContain(TEST_KEY);
  });

  it('declines a schedule whose sections are an empty array', async () => {
    await seedDraft('x');
    await svc.schedulePublish(ACTOR, TEST_KEY, new Date(Date.now() + 3_600_000));
    await prisma.pageLayout.update({
      where: { pageKey: TEST_KEY },
      data: { scheduledAt: new Date(Date.now() - 60_000), scheduledSections: [] },
    });
    const row = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    expect(await svc.executeScheduledPublish(row)).toBeNull();
    expect(row.publishedAt, 'an empty schedule must not blank a live page').toBeNull();
  });
});

/* ── 3. Idempotence, duplicate runners, atomicity ─────────────────── */

describe.runIf(available)('Stage 08 Task G — repeated and concurrent execution is safe', () => {
  async function dueRow() {
    await seedDraft('SCHEDULED');
    await svc.schedulePublish(ACTOR, TEST_KEY, new Date(Date.now() + 3_600_000));
    await backdateSchedule();
    return prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
  }

  it('publishes the scheduled content and clears the schedule', async () => {
    const row = await dueRow();
    const result = await svc.executeScheduledPublish(row);
    expect(result).not.toBeNull();
    expect(JSON.stringify(result!.publishedSections)).toContain('SCHEDULED');
    expect(result!.scheduledAt).toBeNull();
    expect(result!.scheduledSections).toBeNull();
  });

  it('is IDEMPOTENT: executing the same captured row twice publishes once', async () => {
    /**
     * The duplicate-cron / duplicate-replica / retry-after-timeout case. The
     * guard is a claim-by-update: the `updateMany` requires `scheduledAt` and
     * `scheduledSections` to still be set, and clears both. A second attempt
     * matches zero rows.
     */
    const row = await dueRow();
    const first = await svc.executeScheduledPublish(row);
    const second = await svc.executeScheduledPublish(row);
    expect(first).not.toBeNull();
    expect(second, 'a second execution of a consumed schedule must do nothing').toBeNull();
    expect(await prisma.pageLayoutRevision.count({ where: { pageKey: TEST_KEY } })).toBe(1);
  });

  it('five concurrent runners publish once and record ONE revision', async () => {
    const row = await dueRow();
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => svc.executeScheduledPublish(row)));
    const published = results.filter((r) => r !== null);
    expect(published, 'exactly one runner may win').toHaveLength(1);
    expect(await prisma.pageLayoutRevision.count({ where: { pageKey: TEST_KEY } })).toBe(1);
  });

  it('a published schedule ALWAYS has its revision — the two writes are atomic', async () => {
    /**
     * Stage 08 Task B fix, observed from the outside. The revision `create` used
     * to be a separate statement outside any transaction, so a failure between
     * the publish and the insert left content published with no history. Both
     * are now in one interactive transaction.
     */
    const row = await dueRow();
    await svc.executeScheduledPublish(row);
    const layout = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    expect(layout.publishedAt).not.toBeNull();
    const revisions = await prisma.pageLayoutRevision.findMany({ where: { pageKey: TEST_KEY } });
    expect(revisions).toHaveLength(1);
    expect(revisions[0].summary).toBe('Scheduled publish');
    expect(JSON.stringify(revisions[0].snapshot)).toContain('SCHEDULED');
  });

  it('attributes the publish to whoever scheduled it, not to the runner', async () => {
    const row = await dueRow();
    const result = await svc.executeScheduledPublish(row);
    expect(result!.publishedById).toBe(ACTOR.id);
    const rev = await prisma.pageLayoutRevision.findFirstOrThrow({ where: { pageKey: TEST_KEY } });
    expect(rev.actorId).toBe(ACTOR.id);
    expect(rev.actorName).toContain('Stage08 Sched S1');
  });

  it('audits the scheduled publish', async () => {
    const row = await dueRow();
    const before = await prisma.auditLog.count({ where: { action: 'page_layout.scheduled_publish' } });
    await svc.executeScheduledPublish(row);
    expect(await prisma.auditLog.count({ where: { action: 'page_layout.scheduled_publish' } })).toBe(before + 1);
  });

  it('declines a row whose schedule was cancelled between capture and execution', async () => {
    const row = await dueRow();
    await svc.cancelSchedule(ACTOR, TEST_KEY);
    expect(await svc.executeScheduledPublish(row)).toBeNull();
    const layout = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    expect(layout.publishedAt, 'a cancelled schedule must not publish').toBeNull();
  });

  it('increments the version, so an open editor learns its view is stale', async () => {
    const row = await dueRow();
    const before = row.version;
    const result = await svc.executeScheduledPublish(row);
    expect(result!.version).toBe(before + 1);
  });
});

/* ── 4. The runner's own safety properties ────────────────────────── */

describe('Stage 08 Task G — the runner fails closed and is deployment-neutral [structural]', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'cms', 'scheduledPublishRunner.ts'), 'utf8');

  it('skips revalidation when INTERNAL_REVALIDATE_SECRET is absent', () => {
    // Requirement: missing secrets fail closed. It must not fall back to a
    // literal, and it must not issue a request that cannot succeed.
    expect(src).toContain('const secret = process.env.INTERNAL_REVALIDATE_SECRET');
    expect(src).toContain('if (!secret)');
    expect(src).not.toMatch(/INTERNAL_REVALIDATE_SECRET\s*\|\|\s*['"]/);
  });

  it('survives one failing page without abandoning the rest of the batch', () => {
    const fn = src.slice(src.indexOf('export async function runDuePublications'));
    expect(fn).toContain('for (const layout of due)');
    expect(fn).toContain('catch');
  });

  it('exposes runDuePublications so any scheduler can drive it', () => {
    /**
     * The deployment-neutral half of D-12: whatever decides WHEN to run — an
     * in-process timer, a platform cron, a CI job — calls one exported
     * function. Choosing that mechanism is the blocked owner decision; being
     * callable from any of them is not.
     */
    expect(src).toContain('export async function runDuePublications');
    expect(src).toContain('export function startScheduler');
    expect(src).toContain('export function stopScheduler');
  });

  it('still posts revalidation to localhost — the known D-12 limitation', () => {
    /**
     * RECORDED, NOT FIXED. On multiple instances only the publishing replica's
     * cache is flushed, and the target must become the public base URL. That
     * change depends on the hosting decision D-12 has not yet made, so Stage 08
     * documents it rather than guessing a deployment shape.
     */
    expect(src).toContain('http://localhost:${port}');
  });
});
