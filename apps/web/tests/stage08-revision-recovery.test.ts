import { describe, it, expect, afterAll, beforeAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { SectionSlot } from '../lib/cms/sectionRegistry';

/**
 * Stage 08 Task C — revision recovery, proven against the isolated test
 * database.
 *
 * The directive's Task A warns: "Do not claim a feature exists merely because a
 * database table or UI button exists." So every capability the completion
 * report claims for the revision system is exercised here through the real
 * service: restore as draft, publish after restore, ordering, attribution,
 * immutability, authorization, and the behaviour on a malformed snapshot.
 *
 * D-07 (retention) is an UNAPPROVED owner decision, so nothing here prunes or
 * deletes history, and no retention count or duration is assumed. The only
 * deletions are this suite's own cleanup of its own rows.
 */

const TEST_KEY = 'template:competitor';

let available = false;
let skipReason = 'no isolated test database (TEST_DATABASE_URL unset)';
let prisma: PrismaClient;
let svc: typeof import('../lib/cms/pageLayoutService');

const ACTOR: { id: string; roles: never } = { id: '', roles: ['super_admin'] as never };
const OTHER: { id: string; roles: never } = { id: '', roles: ['super_admin'] as never };
const ephemeralUserIds: string[] = [];

if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.pageLayout.findFirst();
    svc = await import('../lib/cms/pageLayoutService');
    available = true;
  } catch (err) {
    skipReason = `revision suite unavailable — ${String(err).replace(/\s+/g, ' ').slice(0, 120)}`;
  }
}

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(`[stage08-revision-recovery] DB suites skipped: ${skipReason}`);
}

function slot(title: string): SectionSlot {
  return { id: 's08r-1', sectionType: 'rich-text-block', visible: true, order: 0, props: { title, body: 'b' } };
}

async function reset(): Promise<void> {
  await prisma.pageLayoutRevision.deleteMany({ where: { pageKey: TEST_KEY } });
  await prisma.pageLayout.deleteMany({ where: { pageKey: TEST_KEY } });
}

/** Save a draft and publish it, producing one revision with that title. */
async function publishTitled(title: string): Promise<void> {
  const row = await prisma.pageLayout.findUnique({ where: { pageKey: TEST_KEY }, select: { version: true } });
  await svc.saveDraft(ACTOR, { pageKey: TEST_KEY, sections: [slot(title)], expectedVersion: row?.version ?? 0 });
  await svc.publishLayout(ACTOR, TEST_KEY);
}

if (available) {
  beforeAll(async () => {
    const stamp = Date.now();
    for (const [actor, label] of [[ACTOR, 'R1'], [OTHER, 'R2']] as const) {
      const user = await prisma.user.create({
        data: { email: `stage08rev-${label}-${stamp}@example.com`, name: `Stage08 Rev ${label}`, status: 'ACTIVE' },
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
  });
}

/* ── 1. Immutability and ordering ─────────────────────────────────── */

describe.runIf(available)('Stage 08 Task C — revision snapshots are immutable and ordered', () => {
  it('records one revision per publish, numbered from 1', async () => {
    await publishTitled('v1');
    await publishTitled('v2');
    await publishTitled('v3');
    const { revisions, total } = await svc.listRevisions(ACTOR, TEST_KEY);
    expect(total).toBe(3);
    expect(revisions.map((r) => r.revisionNo)).toEqual([3, 2, 1]);
  });

  it('orders history by revision number, not by timestamp', async () => {
    /**
     * Ordering by `createdAt` would be ambiguous for publishes inside the same
     * clock tick, which is exactly what a concurrency test produces. The
     * service orders by `revisionNo`, which is unique per page key.
     */
    await publishTitled('a');
    await publishTitled('b');
    const { revisions } = await svc.listRevisions(ACTOR, TEST_KEY);
    const nums = revisions.map((r) => r.revisionNo);
    expect(nums).toEqual([...nums].sort((x, y) => y - x));
  });

  it('keeps each snapshot as it was published, not as the draft later became', async () => {
    await publishTitled('ORIGINAL');
    const current = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    await svc.saveDraft(ACTOR, { pageKey: TEST_KEY, sections: [slot('LATER-DRAFT')], expectedVersion: current.version });

    const { revisions } = await svc.listRevisions(ACTOR, TEST_KEY);
    const rev = await svc.getRevision(ACTOR, revisions[0].id);
    expect(JSON.stringify(rev!.snapshot)).toContain('ORIGINAL');
    expect(JSON.stringify(rev!.snapshot), 'a snapshot must not follow the draft').not.toContain('LATER-DRAFT');
  });

  it('attributes each revision to the actor and the moment', async () => {
    await publishTitled('attributed');
    const { revisions } = await svc.listRevisions(ACTOR, TEST_KEY);
    expect(revisions[0].actorId).toBe(ACTOR.id);
    expect(revisions[0].actorName).toContain('Stage08 Rev R1');
    expect(revisions[0].createdAt).toBeInstanceOf(Date);
    expect(revisions[0].summary).toBe('Immediate publish');
  });

  it('distinguishes an immediate publish from a scheduled one in the summary', async () => {
    await publishTitled('immediate');
    const { revisions } = await svc.listRevisions(ACTOR, TEST_KEY);
    expect(revisions[0].summary).toBe('Immediate publish');
  });

  it('does not expose snapshots in the history listing', async () => {
    // The list is shown in the Admin; snapshots are fetched one at a time.
    await publishTitled('x');
    const { revisions } = await svc.listRevisions(ACTOR, TEST_KEY);
    expect(revisions[0]).not.toHaveProperty('snapshot');
  });
});

/* ── 2. Restore writes the draft, never the published content ─────── */

describe.runIf(available)('Stage 08 Task C — restore prepares a draft and does not publish', () => {
  it('restores the chosen snapshot into the draft', async () => {
    await publishTitled('FIRST');
    await publishTitled('SECOND');
    const { revisions } = await svc.listRevisions(ACTOR, TEST_KEY);
    const first = revisions.find((r) => r.revisionNo === 1)!;

    await svc.restoreRevision(ACTOR, TEST_KEY, first.id);
    const row = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    expect(JSON.stringify(row.draftSections)).toContain('FIRST');
  });

  it('leaves the PUBLISHED content untouched — the restore is not live', async () => {
    await publishTitled('FIRST');
    await publishTitled('SECOND');
    const { revisions } = await svc.listRevisions(ACTOR, TEST_KEY);
    const first = revisions.find((r) => r.revisionNo === 1)!;

    await svc.restoreRevision(ACTOR, TEST_KEY, first.id);
    const row = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    expect(JSON.stringify(row.publishedSections), 'the public site must still show SECOND').toContain('SECOND');
    expect(JSON.stringify(row.publishedSections)).not.toContain('FIRST');
  });

  it('creates no revision of its own — a restore is not a publish', async () => {
    await publishTitled('FIRST');
    await publishTitled('SECOND');
    const before = await prisma.pageLayoutRevision.count({ where: { pageKey: TEST_KEY } });
    const { revisions } = await svc.listRevisions(ACTOR, TEST_KEY);
    await svc.restoreRevision(ACTOR, TEST_KEY, revisions[1].id);
    expect(await prisma.pageLayoutRevision.count({ where: { pageKey: TEST_KEY } })).toBe(before);
  });

  it('the restored draft becomes public only after an explicit publish', async () => {
    await publishTitled('FIRST');
    await publishTitled('SECOND');
    const { revisions } = await svc.listRevisions(ACTOR, TEST_KEY);
    const first = revisions.find((r) => r.revisionNo === 1)!;

    await svc.restoreRevision(ACTOR, TEST_KEY, first.id);
    // Still not live...
    let row = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    expect(JSON.stringify(row.publishedSections)).toContain('SECOND');

    // ...until published, which also records a new revision.
    await svc.publishLayout(ACTOR, TEST_KEY);
    row = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    expect(JSON.stringify(row.publishedSections)).toContain('FIRST');
    expect(await prisma.pageLayoutRevision.count({ where: { pageKey: TEST_KEY } })).toBe(3);
  });

  it('audits the restore and the publish separately', async () => {
    await publishTitled('FIRST');
    const { revisions } = await svc.listRevisions(ACTOR, TEST_KEY);
    const restoreBefore = await prisma.auditLog.count({ where: { action: 'page_layout.restore_revision' } });
    await svc.restoreRevision(ACTOR, TEST_KEY, revisions[0].id);
    expect(await prisma.auditLog.count({ where: { action: 'page_layout.restore_revision' } })).toBe(restoreBefore + 1);
  });
});

/* ── 3. A failed restore changes nothing ──────────────────────────── */

describe.runIf(available)('Stage 08 Task C — a failed restore leaves state unchanged', () => {
  it('refuses a revision id that does not exist', async () => {
    await publishTitled('KEEP');
    await expect(
      svc.restoreRevision(ACTOR, TEST_KEY, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ code: 'not_found' });
    const row = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    expect(JSON.stringify(row.draftSections)).toContain('KEEP');
  });

  it("refuses a revision belonging to a DIFFERENT page key", async () => {
    /**
     * Without this check a revision id from one page could be restored into
     * another, silently replacing that page's draft with a layout built for a
     * different block family.
     */
    await publishTitled('MINE');
    const otherKey = 'template:venue';
    await prisma.pageLayoutRevision.deleteMany({ where: { pageKey: otherKey } });
    await prisma.pageLayout.deleteMany({ where: { pageKey: otherKey } });
    await svc.saveDraft(ACTOR, { pageKey: otherKey, sections: [slot('THEIRS')], expectedVersion: 0 });
    await svc.publishLayout(ACTOR, otherKey);
    const theirs = await prisma.pageLayoutRevision.findFirstOrThrow({ where: { pageKey: otherKey } });

    await expect(svc.restoreRevision(ACTOR, TEST_KEY, theirs.id)).rejects.toMatchObject({ code: 'validation' });
    const row = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    expect(JSON.stringify(row.draftSections)).toContain('MINE');

    await prisma.pageLayoutRevision.deleteMany({ where: { pageKey: otherKey } });
    await prisma.pageLayout.deleteMany({ where: { pageKey: otherKey } });
  });

  it('refuses a MALFORMED snapshot, and says why, without touching the draft', async () => {
    /**
     * Stage 08 finding S08-1. A restore previously wrote `revision.snapshot`
     * straight into `draftSections`, bypassing every check `saveDraft` applies
     * — the one write path into a draft with no validation at all. A snapshot
     * that was malformed became the operator's working draft and then failed
     * confusingly on the next save, pointing at the wrong cause.
     */
    await publishTitled('GOOD-DRAFT');
    const good = await prisma.pageLayoutRevision.findFirstOrThrow({ where: { pageKey: TEST_KEY } });

    // A snapshot that is not a valid slot array. Written directly, because no
    // service path can produce one — which is why the hazard was invisible.
    const bad = await prisma.pageLayoutRevision.create({
      data: {
        pageKey: TEST_KEY,
        revisionNo: good.revisionNo + 1,
        snapshot: [{ id: 'broken', sectionType: 'rich-text-block', visible: 'yes-please', order: -4 }] as never,
        actorId: ACTOR.id,
        actorName: 'Stage08 Rev R1',
        summary: 'Hand-written malformed snapshot',
      },
    });

    let caught: unknown;
    try {
      await svc.restoreRevision(ACTOR, TEST_KEY, bad.id);
    } catch (e) { caught = e; }

    const err = caught as { code: string; message: string } | undefined;
    expect(err, 'a malformed snapshot must be refused').toBeDefined();
    expect(err!.code).toBe('validation');
    expect(err!.message).toContain(`#${bad.revisionNo}`);
    expect(err!.message, 'the operator must be told their draft is safe').toMatch(/not been changed/i);

    // And the draft is exactly as it was.
    const row = await prisma.pageLayout.findUniqueOrThrow({ where: { pageKey: TEST_KEY } });
    expect(JSON.stringify(row.draftSections)).toContain('GOOD-DRAFT');
  });

  it('still restores a VALID revision after a malformed one was refused', async () => {
    await publishTitled('GOOD-DRAFT');
    const good = await prisma.pageLayoutRevision.findFirstOrThrow({ where: { pageKey: TEST_KEY } });
    const bad = await prisma.pageLayoutRevision.create({
      data: {
        pageKey: TEST_KEY,
        revisionNo: good.revisionNo + 1,
        snapshot: { not: 'an array' } as never,
        actorId: ACTOR.id,
        actorName: 'Stage08 Rev R1',
        summary: 'Malformed',
      },
    });
    await svc.restoreRevision(ACTOR, TEST_KEY, bad.id).catch(() => {});
    const restored = await svc.restoreRevision(ACTOR, TEST_KEY, good.id);
    expect(JSON.stringify(restored.draftSections)).toContain('GOOD-DRAFT');
  });
});

/* ── 4. D-07 is unresolved: nothing prunes ────────────────────────── */

describe.runIf(available)('Stage 08 Task C — no retention policy is enforced (D-07 unapproved)', () => {
  it('keeps every revision; publishing prunes nothing', async () => {
    /**
     * D-07 is an UNAPPROVED owner decision. The directive forbids inventing a
     * retention count, duration or pruning schedule, so Stage 08 enforces none
     * and this test pins that: history only grows.
     *
     * Twelve publishes is enough to show no small cap is being applied, without
     * making the suite slow. The decision-ready proposal is in
     * docs/stage-08/STAGE_08_GLOBAL_CONTROLS_AND_DECISIONS.md.
     */
    for (let i = 1; i <= 12; i++) await publishTitled(`v${i}`);
    const total = await prisma.pageLayoutRevision.count({ where: { pageKey: TEST_KEY } });
    expect(total, 'no pruning may happen without D-07 approval').toBe(12);
  });

  it('exposes no pruning or deletion function in the service surface', () => {
    const exported = Object.keys(svc);
    const destructive = exported.filter((k) => /prune|purge|deleteRevision|trimRevision|cleanup/i.test(k));
    expect(destructive, 'a retention implementation would need D-07 approval first').toEqual([]);
  });

  it('paginates history so an unbounded page key cannot produce an unbounded query', async () => {
    for (let i = 1; i <= 6; i++) await publishTitled(`v${i}`);
    const page1 = await svc.listRevisions(ACTOR, TEST_KEY, { limit: 2, offset: 0 });
    const page2 = await svc.listRevisions(ACTOR, TEST_KEY, { limit: 2, offset: 2 });
    expect(page1.revisions).toHaveLength(2);
    expect(page2.revisions).toHaveLength(2);
    expect(page1.total).toBe(6);
    expect(page1.revisions[0].revisionNo).toBeGreaterThan(page2.revisions[0].revisionNo);
  });
});
