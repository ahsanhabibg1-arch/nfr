import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type * as Write from '../lib/redirects/write';

/**
 * Stage 03 — the redirect graph, written through the shared module.
 *
 * These pin the three rules that used to differ between the article and rodeo
 * services (D-3), and they are written against `lib/redirects/write.ts`
 * directly so the rules are tested once rather than twice through two callers:
 *
 *   1. a reclaimed path is DISABLED, never deleted — the history survives;
 *   2. flattening touches ACTIVE rows only, so a disabled record is not
 *      rewritten as a side effect of an unrelated rename;
 *   3. flattening touches PERMANENT rows only, so a deliberate 302/307 keeps
 *      the destination its author chose.
 *
 * Rule 3 guards something nothing writes yet. That is the point: Stage 04 adds
 * manual redirect creation, and the first temporary redirect an operator makes
 * must not be silently re-pointed by the next slug change.
 */

let prisma: PrismaClient;
let w: typeof Write;
let available = false;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    w = await import('../lib/redirects/write');
    available = true;
  } catch {
    available = false;
  }
}

const suite = available ? describe : describe.skip;
const TAG = 's03g';
const rid = () => Math.random().toString(36).slice(2, 9);
const p = (name: string) => `/${TAG}-${name}-${rid()}/`;

suite('Stage 03 — redirect graph rules', () => {
  afterAll(async () => {
    if (!available) return;
    await prisma.articleRedirect.deleteMany({
      where: { OR: [{ sourcePath: { contains: TAG } }, { targetPath: { contains: TAG } }] },
    });
  });

  const row = (sourcePath: string) => prisma.articleRedirect.findUnique({ where: { sourcePath } });

  it('flattens a permanent chain so every historical source lands in one hop', async () => {
    const [a, b, c, d] = [p('a'), p('b'), p('c'), p('d')];
    await prisma.$transaction(async (tx) => { await w.writeMoveRedirect(tx, a, b); });
    await prisma.$transaction(async (tx) => { await w.writeMoveRedirect(tx, b, c); });
    await prisma.$transaction(async (tx) => { await w.writeMoveRedirect(tx, c, d); });

    // A -> D, B -> D, C -> D. Nobody walks a chain.
    expect((await row(a))?.targetPath).toBe(d);
    expect((await row(b))?.targetPath).toBe(d);
    expect((await row(c))?.targetPath).toBe(d);
  });

  it('DISABLES rather than deletes when a path is reclaimed, keeping the history', async () => {
    const [a, b] = [p('reclaim'), p('dest')];
    await prisma.$transaction(async (tx) => { await w.writeMoveRedirect(tx, a, b); });
    expect((await row(a))?.status).toBe('ACTIVE');

    // The entity moves back and takes `a` over again.
    await prisma.$transaction(async (tx) => { await w.claimCanonicalPath(tx, a); });

    const after = await row(a);
    expect(after, 'the historical record must survive a reclaim').not.toBeNull();
    expect(after!.status).toBe('DISABLED');
  });

  it('does NOT rewrite a disabled row when a later rename flattens a chain', async () => {
    const [a, b, c] = [p('hist'), p('mid'), p('final')];
    await prisma.$transaction(async (tx) => { await w.writeMoveRedirect(tx, a, b); });
    await prisma.$transaction(async (tx) => { await w.claimCanonicalPath(tx, a); }); // a is now history

    await prisma.$transaction(async (tx) => { await w.writeMoveRedirect(tx, b, c); });

    const disabled = await row(a);
    expect(disabled!.status).toBe('DISABLED');
    expect(disabled!.targetPath, 'a disabled record is history and must be left alone').toBe(b);
  });

  it('does NOT flatten a TEMPORARY redirect', async () => {
    const [t, b, c] = [p('temp'), p('tb'), p('tc')];
    // A deliberate 307 pointing at b.
    await prisma.articleRedirect.create({ data: { sourcePath: t, targetPath: b, statusCode: 307, status: 'ACTIVE' } });
    // b then moves permanently to c.
    await prisma.$transaction(async (tx) => { await w.writeMoveRedirect(tx, b, c); });

    const after = await row(t);
    expect(after!.statusCode).toBe(307);
    expect(after!.targetPath, 'a temporary destination is a choice, not a forwarding address').toBe(b);
  });

  it('flattens a 301 alongside a 308, since both are permanent', async () => {
    const [legacy, b, c] = [p('l301'), p('lb'), p('lc')];
    await prisma.articleRedirect.create({ data: { sourcePath: legacy, targetPath: b, statusCode: 301, status: 'ACTIVE' } });
    await prisma.$transaction(async (tx) => { await w.writeMoveRedirect(tx, b, c); });
    expect((await row(legacy))?.targetPath).toBe(c);
  });

  it('refuses a self-move', async () => {
    const a = p('self');
    const r = await prisma.$transaction(async (tx) => w.writeMoveRedirect(tx, a, a));
    expect(r.written).toBe(false);
    expect(await row(a)).toBeNull();
  });

  it('refuses a reserved source or destination', async () => {
    const live = p('ok');
    const fromReserved = await prisma.$transaction(async (tx) => w.writeMoveRedirect(tx, '/admin/x/', live));
    const toReserved = await prisma.$transaction(async (tx) => w.writeMoveRedirect(tx, live, '/api/health/'));
    expect(fromReserved.written, 'a redirect out of /admin/ would shadow the real route').toBe(false);
    expect(toReserved.written, 'a redirect into /api/ points a reader at an endpoint').toBe(false);
  });

  it('refuses a malformed path instead of storing it', async () => {
    const live = p('m');
    for (const bad of ['https://evil.example/', '//evil.example/', '\\\\evil.example\\x', '/a/../admin/']) {
      const r = await prisma.$transaction(async (tx) => w.writeMoveRedirect(tx, live, bad));
      expect(r.written, bad).toBe(false);
    }
  });

  it('keeps source uniqueness: a second move from the same path updates, never duplicates', async () => {
    const [a, b, c] = [p('uniq'), p('ub'), p('uc')];
    await prisma.$transaction(async (tx) => { await w.writeMoveRedirect(tx, a, b); });
    await prisma.$transaction(async (tx) => { await w.writeMoveRedirect(tx, a, c); });
    const all = await prisma.articleRedirect.findMany({ where: { sourcePath: a } });
    expect(all).toHaveLength(1);
    expect(all[0].targetPath).toBe(c);
  });

  it('ROLLS BACK the redirect write when the surrounding transaction fails', async () => {
    /*
      The atomicity contract: a redirect must never outlive the mutation that
      caused it. If the entity write fails after the redirect write, the
      redirect has to vanish with it — otherwise a path redirects away from
      content that never moved.
    */
    const [a, b] = [p('rollback'), p('rb')];
    await expect(
      prisma.$transaction(async (tx) => {
        await w.writeMoveRedirect(tx, a, b);
        throw new Error('simulated entity-mutation failure');
      }),
    ).rejects.toThrow('simulated entity-mutation failure');

    expect(await row(a), 'no orphaned redirect may survive a failed transaction').toBeNull();
  });
});
