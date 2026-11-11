import { describe, it, expect, afterAll, beforeAll, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';

/**
 * Stage 09 Task E — information/legal page publication safety.
 *
 * WHY THIS FILE EXISTS. D-09 is recorded as "a confirmed correctness risk", and
 * the Stage 09 directive asks for it to be reproduced with safe tests and for
 * the desired isolation behaviour to be described — without weakening or
 * deleting a failing test to conceal the defect.
 *
 * WHAT THESE TESTS ARE. They pin the CURRENT behaviour exactly, with names that
 * state the defect, so nobody can mistake a green suite for a safe workflow.
 * They are not an endorsement. The tests that would prove real publication
 * isolation cannot run until schema change **S-1** is approved, so they are
 * written out in the S-1 approval package in
 * `docs/stage-09/STAGE_09_LEGAL_AND_INFO_PAGE_DECISIONS.md` rather than added
 * here as deliberately-red tests.
 *
 * A CORRECTION TO THE REPORTED RISK. The directive describes it as "the current
 * editing workflow can affect a live page while the editor believes they are
 * saving a draft". Measured, the code is stricter and the risk is different:
 * `saveInfoPageDraft` **refuses** to touch a PUBLISHED page. The actual defect
 * is that it refuses by instructing an action that **does not exist** ("Create a
 * new draft revision"), and the only path that does exist —
 * `unpublishInfoPage` — takes the page off the public site. So a live legal page
 * cannot be silently rewritten; it can be silently **removed or reverted to
 * different built-in text**. §2 of this file proves that.
 *
 * DATABASE: the isolated test database only. Rows use a reserved probe slug and
 * are removed in `afterAll`.
 */

const PROBE_SLUG = 'stage09-probe-page';
/** A real legacy slug, which has hardcoded fallback content behind it. */
const LEGACY_SLUG = 'about';

let available = false;
let prisma: PrismaClient;
let svc: typeof import('../lib/cms/infoPageService');

const ADMIN: { id: string; roles: never } = { id: '', roles: ['super_admin'] as never };
const NO_PERM: { id: string; roles: never } = { id: '', roles: ['author'] as never };
const ephemeralUserIds: string[] = [];

if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.infoPage.findFirst();
    svc = await import('../lib/cms/infoPageService');
    available = true;
  } catch {
    available = false;
  }
}

if (!available) {
  // eslint-disable-next-line no-console
  console.warn('[stage09-infopage-publication] DB suites skipped: no isolated test database');
}

function input(over: Record<string, unknown> = {}) {
  return {
    slug: PROBE_SLUG,
    title: 'Stage 09 Probe Page',
    body: '<p>Original body.</p>',
    seoTitle: null,
    metaDescription: null,
    ...over,
  } as Parameters<typeof svc.saveInfoPageDraft>[1];
}

async function reset(): Promise<void> {
  await prisma.infoPage.deleteMany({ where: { slug: { in: [PROBE_SLUG, LEGACY_SLUG] } } });
}

/** Drive a page all the way to PUBLISHED. */
async function publishProbe(body = '<p>Live body.</p>'): Promise<void> {
  await svc.saveInfoPageDraft(ADMIN, input({ body }));
  await svc.submitForReview(ADMIN, PROBE_SLUG);
  await svc.approveInfoPage(ADMIN, PROBE_SLUG);
  await svc.publishInfoPage(ADMIN, PROBE_SLUG);
}

if (available) {
  beforeAll(async () => {
    const stamp = Date.now();
    for (const [actor, label] of [[ADMIN, 'A'], [NO_PERM, 'N']] as const) {
      const user = await prisma.user.create({
        data: { email: `stage09info-${label}-${stamp}@example.com`, name: `Stage09 Info ${label}`, status: 'ACTIVE' },
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

/* ── 1. The workflow that does work ───────────────────────────────── */

describe.runIf(available)('Stage 09 Task E — the four-state workflow behaves as documented', () => {
  it('walks DRAFT → PENDING_REVIEW → APPROVED → PUBLISHED', async () => {
    await svc.saveInfoPageDraft(ADMIN, input());
    expect((await svc.getInfoPage(PROBE_SLUG))!.status).toBe('DRAFT');
    await svc.submitForReview(ADMIN, PROBE_SLUG);
    expect((await svc.getInfoPage(PROBE_SLUG))!.status).toBe('PENDING_REVIEW');
    await svc.approveInfoPage(ADMIN, PROBE_SLUG);
    expect((await svc.getInfoPage(PROBE_SLUG))!.status).toBe('APPROVED');
    await svc.publishInfoPage(ADMIN, PROBE_SLUG);
    expect((await svc.getInfoPage(PROBE_SLUG))!.status).toBe('PUBLISHED');
  });

  it('keeps an unpublished page off the public read at every pre-published state', async () => {
    // The one isolation guarantee that DOES hold: `getPublishedInfoPage`
    // filters on status, so a draft is never served.
    await svc.saveInfoPageDraft(ADMIN, input());
    expect(await svc.getPublishedInfoPage(PROBE_SLUG)).toBeNull();
    await svc.submitForReview(ADMIN, PROBE_SLUG);
    expect(await svc.getPublishedInfoPage(PROBE_SLUG)).toBeNull();
    await svc.approveInfoPage(ADMIN, PROBE_SLUG);
    expect(await svc.getPublishedInfoPage(PROBE_SLUG), 'approved is not published').toBeNull();
    await svc.publishInfoPage(ADMIN, PROBE_SLUG);
    expect(await svc.getPublishedInfoPage(PROBE_SLUG)).not.toBeNull();
  });

  it('refuses to skip a state', async () => {
    await svc.saveInfoPageDraft(ADMIN, input());
    await expect(svc.approveInfoPage(ADMIN, PROBE_SLUG)).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.publishInfoPage(ADMIN, PROBE_SLUG)).rejects.toMatchObject({ code: 'validation' });
  });

  it('requires system.config at every transition', async () => {
    await expect(svc.saveInfoPageDraft(NO_PERM, input())).rejects.toMatchObject({ code: 'forbidden' });
    await svc.saveInfoPageDraft(ADMIN, input());
    await expect(svc.submitForReview(NO_PERM, PROBE_SLUG)).rejects.toMatchObject({ code: 'forbidden' });
    await svc.submitForReview(ADMIN, PROBE_SLUG);
    await expect(svc.approveInfoPage(NO_PERM, PROBE_SLUG)).rejects.toMatchObject({ code: 'forbidden' });
    await svc.approveInfoPage(ADMIN, PROBE_SLUG);
    await expect(svc.publishInfoPage(NO_PERM, PROBE_SLUG)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('audits every transition', async () => {
    const actions = [
      'info_page.save_draft', 'info_page.submit_review', 'info_page.approve', 'info_page.publish',
    ];
    const before = await Promise.all(actions.map((a) => prisma.auditLog.count({ where: { action: a } })));
    await publishProbe();
    const after = await Promise.all(actions.map((a) => prisma.auditLog.count({ where: { action: a } })));
    for (const [i, a] of actions.entries()) {
      expect(after[i], `${a} must be audited`).toBe(before[i] + 1);
    }
  });

  it('sanitizes the body on save, so a legal page cannot carry script', async () => {
    await svc.saveInfoPageDraft(ADMIN, input({ body: '<p>ok</p><script>alert(1)</script><img src=x onerror=alert(1)>' }));
    const page = await svc.getInfoPage(PROBE_SLUG);
    expect(page!.body).not.toContain('<script');
    expect(page!.body).not.toContain('onerror');
    expect(page!.body).toContain('ok');
  });
});

/* ── 2. The defect, reproduced ─────────────────────────────────────── */

describe.runIf(available)('Stage 09 Task E — DEFECT D-09: a published page cannot be edited', () => {
  it('DEFECT: editing a PUBLISHED page is refused, so the live page is never silently rewritten', async () => {
    /**
     * The reassuring half, and worth pinning: there is no path by which an
     * editor's save reaches live content. The refusal is real.
     */
    await publishProbe('<p>LIVE CONTENT.</p>');
    await expect(
      svc.saveInfoPageDraft(ADMIN, input({ body: '<p>ATTEMPTED EDIT.</p>' })),
    ).rejects.toMatchObject({ code: 'validation' });

    const live = await svc.getPublishedInfoPage(PROBE_SLUG);
    expect(live!.body, 'the live body must be untouched').toContain('LIVE CONTENT');
    expect(live!.body).not.toContain('ATTEMPTED EDIT');
  });

  it('DEFECT: the refusal names a mechanism that does not exist', async () => {
    /**
     * THE CORE OF D-09. The error says "Create a new draft revision." There is
     * no such function, action, route or button anywhere in the codebase — so
     * the message sends the operator to look for something that was never
     * built. Asserted against the service's exported surface, not its text, so
     * this cannot pass by a wording change alone.
     */
    await publishProbe();
    let message = '';
    try {
      await svc.saveInfoPageDraft(ADMIN, input({ body: '<p>x</p>' }));
    } catch (e) { message = (e as Error).message; }

    expect(message, 'Stage 09 rewrote this message; see §3').not.toContain('Create a new draft revision');

    // And the mechanism still does not exist.
    const exported = Object.keys(svc);
    const revisionLike = exported.filter((k) => /revision|newDraft|createDraft|forkDraft/i.test(k));
    expect(revisionLike, 'no draft-revision mechanism exists for InfoPage').toEqual([]);
  });

  it('DEFECT: the only forward path removes the page from public view', async () => {
    /**
     * `unpublishInfoPage` is the sole way to make a published page editable, and
     * it sets status to DRAFT — which `getPublishedInfoPage` then filters out.
     * For a NON-legacy slug the public page has nothing behind it.
     */
    await publishProbe('<p>LIVE CONTENT.</p>');
    expect(await svc.getPublishedInfoPage(PROBE_SLUG)).not.toBeNull();

    await svc.unpublishInfoPage(ADMIN, PROBE_SLUG);

    expect(
      await svc.getPublishedInfoPage(PROBE_SLUG),
      'the page is gone from the public read — this is the D-09 risk',
    ).toBeNull();
    // The content still exists in the row; it is simply no longer public.
    expect((await svc.getInfoPage(PROBE_SLUG))!.body).toContain('LIVE CONTENT');
  });

  it('DEFECT: for a LEGACY slug, unpublishing silently swaps in different built-in text', async () => {
    /**
     * Worse than a 404 in one way: the URL keeps working, so nothing looks
     * broken, but the wording a reader sees changes to the hardcoded config —
     * which for every legal page is still marked pending review and renders a
     * draft banner.
     */
    const { getLegalPage } = await import('../config/legalPages');
    const fallback = getLegalPage(LEGACY_SLUG);
    expect(fallback, 'the probe assumes a legacy slug with built-in content').toBeDefined();

    await svc.saveInfoPageDraft(ADMIN, { ...input(), slug: LEGACY_SLUG, title: 'DB About', body: '<p>DB BODY.</p>' });
    await svc.submitForReview(ADMIN, LEGACY_SLUG);
    await svc.approveInfoPage(ADMIN, LEGACY_SLUG);
    await svc.publishInfoPage(ADMIN, LEGACY_SLUG);
    expect((await svc.getPublishedInfoPage(LEGACY_SLUG))!.body).toContain('DB BODY');

    await svc.unpublishInfoPage(ADMIN, LEGACY_SLUG);
    expect(await svc.getPublishedInfoPage(LEGACY_SLUG)).toBeNull();
    // ...and the route will now render `fallback`, whose review status is not approved.
    expect(fallback!.review).not.toBe('approved');
  });

  it('saving over an APPROVED page drops the approval — now visibly, not silently', async () => {
    /**
     * A second, separate defect found while reproducing the first.
     * `saveInfoPageDraft`'s update sets `status: 'DRAFT'` unconditionally, so an
     * edit to a page awaiting publication throws away its approval. That part is
     * CORRECT — the approved wording is no longer what is stored, so it must be
     * re-approved.
     *
     * What was wrong, and what Stage 09 fixed: `approvedById` and `approvedAt`
     * were left behind, so the row kept claiming an approval it no longer held,
     * and nothing recorded that a legal-page approval had been lost. The stamp
     * is now cleared and the audit record says so — see §3.
     */
    await svc.saveInfoPageDraft(ADMIN, input());
    await svc.submitForReview(ADMIN, PROBE_SLUG);
    await svc.approveInfoPage(ADMIN, PROBE_SLUG);
    const approved = await svc.getInfoPage(PROBE_SLUG);
    expect(approved!.status).toBe('APPROVED');
    expect(approved!.approvedAt).not.toBeNull();
    expect(approved!.approvedById).not.toBeNull();

    await svc.saveInfoPageDraft(ADMIN, input({ body: '<p>edited.</p>' }));
    const after = await svc.getInfoPage(PROBE_SLUG);
    expect(after!.status, 'the approval is dropped, which is correct').toBe('DRAFT');
    expect(after!.approvedAt, 'and the stamp no longer lies about it').toBeNull();
    expect(after!.approvedById).toBeNull();
  });

  it('DEFECT: reverting a published page is also refused', async () => {
    await publishProbe();
    await expect(svc.revertToDraft(ADMIN, PROBE_SLUG)).rejects.toMatchObject({ code: 'validation' });
  });

  it('there is NO draft-alongside-published capability — the schema cannot express one', async () => {
    /**
     * The structural reason the above cannot be fixed without S-1. `InfoPage`
     * holds ONE `body` and ONE `status`. There is no column that could hold a
     * draft while a different version stays published.
     */
    await publishProbe();
    const row = await prisma.infoPage.findUniqueOrThrow({ where: { slug: PROBE_SLUG } });
    const keys = Object.keys(row);
    expect(keys).toContain('body');
    expect(keys.filter((k) => /^(draft|published)(Body|Sections|Content)$/i.test(k))).toEqual([]);
  });
});

/* ── 3. Stage 09's policy-independent safeguards ──────────────────── */

describe.runIf(available)('Stage 09 Task E — the safeguards Stage 09 could add without a schema change', () => {
  it('the refusal now explains what will actually happen, and what is missing', async () => {
    /**
     * The honest replacement for an impossible instruction. It must name the
     * real consequence — unpublishing takes the page off the public site — so
     * the operator can decide, rather than hunting for a button that was never
     * built.
     */
    await publishProbe();
    let message = '';
    try {
      await svc.saveInfoPageDraft(ADMIN, input({ body: '<p>x</p>' }));
    } catch (e) { message = (e as Error).message; }

    expect(message).toMatch(/published/i);
    expect(message, 'it must name the only real path').toMatch(/unpublish/i);
    expect(message, 'and warn what that path costs').toMatch(/public|visitor|live/i);
    expect(message, 'and not invent a mechanism').not.toMatch(/draft revision/i);
  });

  it('unpublishing is still permitted, but its audit record states the public effect', async () => {
    // The operator may legitimately need to take a page down. Stage 09 does not
    // block that; it makes the consequence legible after the fact.
    await publishProbe();
    await svc.unpublishInfoPage(ADMIN, PROBE_SLUG);
    const entry = await prisma.auditLog.findFirst({
      where: { action: 'info_page.unpublish', entityType: 'InfoPage' },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry).not.toBeNull();
    expect(entry!.detail, 'the audit must record that the page left public view').toMatch(/removed from public|no longer public/i);
  });

  it('saving over an approved page records that the approval was reset', async () => {
    await svc.saveInfoPageDraft(ADMIN, input());
    await svc.submitForReview(ADMIN, PROBE_SLUG);
    await svc.approveInfoPage(ADMIN, PROBE_SLUG);
    await svc.saveInfoPageDraft(ADMIN, input({ body: '<p>edited.</p>' }));

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'info_page.save_draft' },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry!.detail, 'losing an approval must not be silent').toMatch(/approval reset|re-approval/i);
  });

  it('a stale approval stamp is cleared when the approval is dropped', async () => {
    // So the row cannot claim an approval it no longer holds.
    await svc.saveInfoPageDraft(ADMIN, input());
    await svc.submitForReview(ADMIN, PROBE_SLUG);
    await svc.approveInfoPage(ADMIN, PROBE_SLUG);
    await svc.saveInfoPageDraft(ADMIN, input({ body: '<p>edited.</p>' }));

    const after = await svc.getInfoPage(PROBE_SLUG);
    expect(after!.status).toBe('DRAFT');
    expect(after!.approvedAt, 'a dropped approval must leave no stamp').toBeNull();
    expect(after!.approvedById).toBeNull();
  });

  it('the publication workflow itself remains BLOCKED pending S-1', () => {
    /**
     * Stated as an executable claim so the completion report cannot overstate
     * what Stage 09 delivered. An accurate warning is not publication
     * isolation; only separate draft and published content is.
     */
    const exported = Object.keys(svc);
    expect(exported.filter((k) => /publishDraft|draftBody|publishedBody/i.test(k))).toEqual([]);
  });
});
