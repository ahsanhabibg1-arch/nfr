import { describe, it, expect, afterAll, beforeAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { SectionSlot } from '../lib/cms/sectionRegistry';

/**
 * Stage 08 Task B — optimistic concurrency (KD-09) and atomic revision
 * numbering (KD-10), proven by running real concurrent operations against the
 * isolated test database.
 *
 * WHY IT HAS TO BE DONE THIS WAY. Both defects are races. A source-text
 * assertion cannot see either of them, and a single-threaded test cannot
 * either: the old code passed every existing test while silently losing one
 * editor's work and while being one `Promise.all` away from a P2002 on publish.
 * Every test below therefore either drives two overlapping operations or
 * inspects the stored version/revision state they produced.
 *
 * DATABASE: `TEST_DATABASE_URL` only, enforced by `vitest.config.ts`. Rows are
 * created under a reserved page key and removed in `afterAll`. Production is
 * never contacted.
 */

const TEST_KEY = 'template:venue';

let available = false;
let skipReason = 'no isolated test database (TEST_DATABASE_URL unset)';
let prisma: PrismaClient;
let svc: typeof import('../lib/cms/pageLayoutService');

/**
 * `AuditLog.actorId` carries a foreign key to `User`, and every mutation here is
 * audited, so the actors must be REAL rows. Two ephemeral users are created in
 * `beforeAll` and removed in `afterAll` — the same pattern the Stage 03
 * causation suite established. Two distinct users is not incidental: the
 * conflict message names who last edited the page, and that cannot be checked
 * with one identity.
 */
const ACTOR_A: { id: string; roles: never } = { id: '', roles: ['super_admin'] as never };
const ACTOR_B: { id: string; roles: never } = { id: '', roles: ['super_admin'] as never };
const NO_PERM: { id: string; roles: never } = { id: '', roles: ['author'] as never };
const ephemeralUserIds: string[] = [];

if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.pageLayout.findFirst();
    svc = await import('../lib/cms/pageLayoutService');
    available = true;
  } catch (err) {
    skipReason = `concurrency suite unavailable — ${String(err).replace(/\s+/g, ' ').slice(0, 120)}`;
  }
}

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(`[stage08-concurrency] DB suites skipped: ${skipReason}`);
}

function slot(title: string, order = 0): SectionSlot {
  return {
    id: `s08c-${order}`,
    sectionType: 'rich-text-block',
    visible: true,
    order,
    props: { title, body: 'body' },
  };
}

/** Remove the layout and its cascaded revisions, so each test starts clean. */
async function reset(): Promise<void> {
  await prisma.pageLayoutRevision.deleteMany({ where: { pageKey: TEST_KEY } });
  await prisma.pageLayout.deleteMany({ where: { pageKey: TEST_KEY } });
}

async function currentVersion(): Promise<number> {
  const row = await prisma.pageLayout.findUnique({ where: { pageKey: TEST_KEY }, select: { version: true } });
  return row?.version ?? 0;
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
    for (const [actor, label] of [[ACTOR_A, 'A'], [ACTOR_B, 'B'], [NO_PERM, 'NP']] as const) {
      const user = await prisma.user.create({
        data: { email: `stage08-${label}-${stamp}@example.com`, name: `Stage08 Actor ${label}`, status: 'ACTIVE' },
      });
      actor.id = user.id as never;
      ephemeralUserIds.push(user.id);
    }
  });

  beforeEach(reset);

  afterAll(async () => {
    await reset();
    // Audit rows reference the ephemeral users, so they go first.
    for (const id of ephemeralUserIds) {
      await prisma.auditLog.deleteMany({ where: { actorId: id } });
      await prisma.user.deleteMany({ where: { id } });
    }
    await drainPool();
  });
}

/* ── 1. The version is a real, moving token ───────────────────────── */

describe.runIf(available)('Stage 08 Task B — version is maintained on every write', () => {
  it('a first save creates the row at version 1', async () => {
    const row = await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('first')], expectedVersion: 0 });
    expect(row.version).toBe(1);
  });

  it('each subsequent save increments it', async () => {
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('a')], expectedVersion: 0 });
    const second = await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('b')], expectedVersion: 1 });
    expect(second.version).toBe(2);
    const third = await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('c')], expectedVersion: 2 });
    expect(third.version).toBe(3);
  });

  it('publish increments it too', async () => {
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('a')], expectedVersion: 0 });
    const published = await svc.publishLayout(ACTOR_A, TEST_KEY);
    expect(published.version).toBe(2);
  });

  it('reset-to-published increments it', async () => {
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('a')], expectedVersion: 0 });
    await svc.publishLayout(ACTOR_A, TEST_KEY);
    const before = await currentVersion();
    await svc.resetDraftToPublished(ACTOR_A, TEST_KEY);
    expect(await currentVersion()).toBe(before + 1);
  });

  it('restore-defaults increments it', async () => {
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('a')], expectedVersion: 0 });
    const before = await currentVersion();
    await svc.restoreDefaults(ACTOR_A, TEST_KEY);
    expect(await currentVersion()).toBe(before + 1);
  });

  it('restoring a revision increments it', async () => {
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('a')], expectedVersion: 0 });
    await svc.publishLayout(ACTOR_A, TEST_KEY);
    const { revisions } = await svc.listRevisions(ACTOR_A, TEST_KEY);
    const before = await currentVersion();
    await svc.restoreRevision(ACTOR_A, TEST_KEY, revisions[0].id);
    expect(await currentVersion()).toBe(before + 1);
  });

  it('REGRESSION: before Stage 08 only ONE of these transitions moved the version', () => {
    /**
     * Documented as an executable claim rather than prose. `version` existed on
     * the model from the start, but `executeScheduledPublish` was the only
     * writer — so even a caller that read it could not detect an interactive
     * edit, which is why KD-09 was invisible for seven stages.
     */
    const src = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '..', 'lib', 'cms', 'pageLayoutService.ts'),
      'utf8',
    ) as string;
    const writers = src.match(/version: \{ increment: 1 \}/g) ?? [];
    expect(writers.length, 'every state-changing transition must maintain the token').toBeGreaterThanOrEqual(5);
  });
});

/* ── 2. Stale saves are refused, not applied ──────────────────────── */

describe.runIf(available)('Stage 08 Task B — a stale save is refused with a usable explanation', () => {
  it('refuses a save that carries an outdated version', async () => {
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('v1')], expectedVersion: 0 });
    // Editor B loaded version 1 at the same moment; editor A saves again first.
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('v2-from-A')], expectedVersion: 1 });

    await expect(
      svc.saveDraft(ACTOR_B, { pageKey: TEST_KEY, sections: [slot('v2-from-B')], expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it("does NOT overwrite the other editor's content", async () => {
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('v1')], expectedVersion: 0 });
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('KEEP-THIS-FROM-A')], expectedVersion: 1 });
    await svc.saveDraft(ACTOR_B, { pageKey: TEST_KEY, sections: [slot('LOST-FROM-B')], expectedVersion: 1 }).catch(() => {});

    const row = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    const json = JSON.stringify(row.draftSections);
    expect(json, 'the first writer must be preserved').toContain('KEEP-THIS-FROM-A');
    expect(json, 'the stale writer must not have landed').not.toContain('LOST-FROM-B');
  });

  it('does not advance the version on a refused save', async () => {
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('v1')], expectedVersion: 0 });
    const before = await currentVersion();
    await svc.saveDraft(ACTOR_B, { pageKey: TEST_KEY, sections: [slot('stale')], expectedVersion: 0 }).catch(() => {});
    expect(await currentVersion()).toBe(before);
  });

  it('explains what happened: both versions, who, and when', async () => {
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('v1')], expectedVersion: 0 });
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('v2')], expectedVersion: 1 });

    let caught: unknown;
    try {
      await svc.saveDraft(ACTOR_B, { pageKey: TEST_KEY, sections: [slot('x')], expectedVersion: 1 });
    } catch (e) { caught = e; }

    const err = caught as { code: string; message: string; details: Record<string, unknown> };
    expect(err.code).toBe('conflict');
    // The message must tell the operator their work was NOT saved — the single
    // most important fact, and the one the old silent overwrite never conveyed.
    expect(err.message).toMatch(/not been saved|NOT been saved/i);
    expect(err.message).toMatch(/reload/i);
    expect(err.details.expectedVersion).toBe(1);
    expect(err.details.currentVersion).toBe(2);
    expect(err.details.lastEditedAt, 'the operator needs to know when').toBeTruthy();
  });

  it('audits the refusal, so an operator question has an answer', async () => {
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('v1')], expectedVersion: 0 });
    const before = await prisma.auditLog.count({ where: { action: 'page_layout.draft_save_conflict' } });
    await svc.saveDraft(ACTOR_B, { pageKey: TEST_KEY, sections: [slot('stale')], expectedVersion: 0 }).catch(() => {});
    const after = await prisma.auditLog.count({ where: { action: 'page_layout.draft_save_conflict' } });
    expect(after).toBe(before + 1);
  });

  it('accepts the save once the editor reloads and retries with the current version', async () => {
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('v1')], expectedVersion: 0 });
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('v2')], expectedVersion: 1 });
    await svc.saveDraft(ACTOR_B, { pageKey: TEST_KEY, sections: [slot('x')], expectedVersion: 1 }).catch(() => {});

    // The recovery path: reload, then save against what is actually stored.
    const fresh = await currentVersion();
    const ok = await svc.saveDraft(ACTOR_B, { pageKey: TEST_KEY, sections: [slot('B-AFTER-RELOAD')], expectedVersion: fresh });
    expect(ok.version).toBe(fresh + 1);
    const row = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    expect(JSON.stringify(row.draftSections)).toContain('B-AFTER-RELOAD');
  });

  it("'unchecked' skips the guard but still moves the token", async () => {
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('v1')], expectedVersion: 0 });
    const r = await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('script')], expectedVersion: 'unchecked' });
    expect(r.version).toBe(2);
    // ...so an editor holding the old token is still told it is stale.
    await expect(
      svc.saveDraft(ACTOR_B, { pageKey: TEST_KEY, sections: [slot('x')], expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });
});

/* ── 3. Genuine concurrency ───────────────────────────────────────── */

describe.runIf(available)('Stage 08 Task B — real concurrent operations', () => {
  it('two simultaneous saves from the same loaded version: exactly one wins', async () => {
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('base')], expectedVersion: 0 });

    const results = await Promise.allSettled([
      svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('from-A')], expectedVersion: 1 }),
      svc.saveDraft(ACTOR_B, { pageKey: TEST_KEY, sections: [slot('from-B')], expectedVersion: 1 }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled, 'exactly one save must succeed').toHaveLength(1);
    expect(rejected, 'the other must be refused, not silently applied').toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'conflict' });
    expect(await currentVersion(), 'only one increment may land').toBe(2);
  });

  it('five simultaneous saves from the same version: one wins, four are refused', async () => {
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('base')], expectedVersion: 0 });

    const results = await Promise.allSettled(
      [1, 2, 3, 4, 5].map((n) =>
        svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot(`racer-${n}`)], expectedVersion: 1 }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await currentVersion()).toBe(2);
    for (const r of results.filter((x) => x.status === 'rejected')) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({ code: 'conflict' });
    }
  });

  it('concurrent publishes never produce a duplicate revision number (KD-10)', async () => {
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('base')], expectedVersion: 0 });

    /**
     * THE OUTCOME IS CORRECT — BUT READ THE CAVEAT.
     *
     * This asserts what matters to an operator: five overlapping publishes
     * produce five distinct, contiguous revision numbers and no failures.
     *
     * It does NOT isolate the Stage 08 fix, and mutation testing proved that.
     * Removing the fix — moving the revision read back outside the transaction
     * (M3), removing the retry (M4), and even both together — leaves this test
     * GREEN. The reason is `publishLayout`'s own `pageLayout.update`: it takes a
     * row lock on the layout, so concurrent publishes of the SAME page key
     * serialise on that lock and the revision-number read never actually races.
     *
     * So the duplicate-number half of KD-10 appears unreachable through
     * `publishLayout` in practice. The transaction fix remains correct and is
     * genuinely load-bearing for the OTHER half — a published layout can no
     * longer exist without its revision, which `executeScheduledPublish` really
     * did violate by writing the two outside any transaction. That half is
     * proven in tests/stage08-scheduler.test.ts, where mutation M9 is killed.
     *
     * Recorded rather than dressed up: two mutations survive, and the Stage 08
     * test report says so.
     */
    const results = await Promise.allSettled(
      [1, 2, 3, 4, 5].map(() => svc.publishLayout(ACTOR_A, TEST_KEY)),
    );

    const failures = results.filter((r) => r.status === 'rejected');
    expect(
      failures.map((f) => String((f as PromiseRejectedResult).reason)),
      'no publish may fail on revision-number contention',
    ).toEqual([]);

    const revisions = await prisma.pageLayoutRevision.findMany({
      where: { pageKey: TEST_KEY },
      select: { revisionNo: true },
      orderBy: { revisionNo: 'asc' },
    });
    const numbers = revisions.map((r) => r.revisionNo);
    expect(numbers, 'five publishes, five revisions').toHaveLength(5);
    expect(new Set(numbers).size, 'all revision numbers must be distinct').toBe(5);
    expect(numbers, 'and contiguous from 1').toEqual([1, 2, 3, 4, 5]);
  });

  it('a publish and its revision are all-or-nothing', async () => {
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('base')], expectedVersion: 0 });
    const publishes = 3;
    await Promise.all(Array.from({ length: publishes }, () => svc.publishLayout(ACTOR_A, TEST_KEY)));

    // Every publish that changed `publishedAt` must have left a revision.
    const revisionCount = await prisma.pageLayoutRevision.count({ where: { pageKey: TEST_KEY } });
    expect(revisionCount).toBe(publishes);
  });
});

/* ── 4. Authorization is server-side ──────────────────────────────── */

describe.runIf(available)('Stage 08 Task B — authorization is enforced in the service', () => {
  it('refuses a draft save without system.config', async () => {
    await expect(
      svc.saveDraft(NO_PERM, { pageKey: TEST_KEY, sections: [slot('x')], expectedVersion: 0 }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('refuses a publish without system.config', async () => {
    await svc.saveDraft(ACTOR_A, { pageKey: TEST_KEY, sections: [slot('x')], expectedVersion: 0 });
    await expect(svc.publishLayout(NO_PERM, TEST_KEY)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('refuses listing revisions without system.config', async () => {
    /**
     * Stage 08 finding S08-3. `listRevisions` and `getRevision` previously took
     * no actor and performed no check; they were safe only because every caller
     * happened to be a guarded Server Action — an invariant nothing enforced.
     * Revision snapshots contain unpublished draft content, so an unguarded
     * future caller would have been a draft leak.
     */
    await expect(svc.listRevisions(NO_PERM, TEST_KEY)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('refuses reading a revision without system.config', async () => {
    await expect(svc.getRevision(NO_PERM, 'any-id')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('refuses a restore without system.config', async () => {
    await expect(svc.restoreRevision(NO_PERM, TEST_KEY, 'any-id')).rejects.toMatchObject({ code: 'forbidden' });
  });
});
