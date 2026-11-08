import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { scopeLockKey, NS_SCOPE } from '../lib/seo-intel/auditLock';

/**
 * Batch S / S7 — audit lock lifecycle. The PostgreSQL suites run against the REAL isolated
 * test database (vitest.config forces DATABASE_URL to it; they self-skip without one) — no
 * mocks: real advisory locks, real pooled connections, real pg_terminate_backend.
 */

describe('S7 — lock key strategy (pure)', () => {
  it('is deterministic per scope, distinct across scopes, and a signed int32', () => {
    expect(scopeLockKey('full')).toBe(scopeLockKey('full'));
    const keys = ['full', 'technical', 'rodeo', 'article:a', 'article:b'].map(scopeLockKey);
    expect(new Set(keys).size).toBe(5);
    for (const k of keys) { expect(Number.isInteger(k)).toBe(true); expect(k).toBeGreaterThanOrEqual(-(2 ** 31)); expect(k).toBeLessThan(2 ** 31); }
  });
});

let prisma: PrismaClient;
let available = false;
let L: typeof import('../lib/seo-intel/auditLock');
let orch: typeof import('../lib/seo-intel/orchestrator');
let actorId = '';
if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    L = await import('../lib/seo-intel/auditLock');
    orch = await import('../lib/seo-intel/orchestrator');
    available = true;
  } catch { available = false; }
}
const pg = available ? describe : describe.skip;

type Handle = import('../lib/seo-intel/auditLock').AuditLockHandle;
const open: Handle[] = [];
async function take(scope: string, opts?: { maxHoldMs?: number }): Promise<Handle | null> {
  const r = await L.acquireAuditLock(prisma, scope, opts);
  if (!r.ok) return null;
  open.push(r.handle);
  return r.handle;
}
afterEach(async () => { while (open.length) await open.pop()!.release(); });

pg('S7 — PostgreSQL advisory lock (real database)', () => {
  it('same scope is exclusive; different narrow scopes are independent; full excludes everything', async () => {
    const a = await take('technical');
    expect(a).not.toBeNull();
    expect(await take('technical')).toBeNull();      // same scope → busy
    expect(await take('rodeo')).not.toBeNull();      // different scope → runs in parallel
    expect(await take('full')).toBeNull();           // full needs the global key exclusively
    while (open.length) await open.pop()!.release();
    const f = await take('full');
    expect(f).not.toBeNull();
    expect(await take('rodeo')).toBeNull();          // nothing runs beside a full audit
  });

  it('simultaneous acquisition of one scope yields exactly one owner (real cross-connection race)', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => L.acquireAuditLock(prisma, 'article:race')));
    const winners = results.filter((r) => r.ok);
    expect(winners).toHaveLength(1);
    for (const w of winners) if (w.ok) open.push(w.handle);
    // the winners' backends are distinct pooled connections from the losers' (losers already released)
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.reason === 'busy')).toBe(true);
  });

  it('the lock lives on ONE pinned connection: visible in pg_locks for that backend only', async () => {
    const h = (await take('article:pin'))!;
    await h.assertHeld();
    const rows = await prisma.$queryRaw<{ pid: number; classid: number; objid: bigint; mode: string }[]>`
      SELECT pid, classid::int8::int AS classid, objid::int8 AS objid, mode FROM pg_locks
      WHERE locktype = 'advisory' AND granted AND pid = ${h.pid}`;
    const scopeRow = rows.find((r) => Number(r.classid) === NS_SCOPE);
    expect(scopeRow).toBeDefined();
    expect(Number(scopeRow!.objid)).toBe(scopeLockKey('article:pin') >>> 0);
    expect(rows.some((r) => r.mode === 'ShareLock')).toBe(true);   // shared global key
    expect(rows.some((r) => r.mode === 'ExclusiveLock')).toBe(true); // exclusive scope key
    const [{ me }] = await prisma.$queryRaw<{ me: number }[]>`SELECT pg_backend_pid() AS me`;
    expect(me).not.toBe(h.pid); // ordinary queries use other pooled connections
  });

  it('another execution cannot release it; release is idempotent and ends ownership', async () => {
    const a = (await take('technical'))!;
    const other = (await take('rodeo'))!;
    await other.release();                            // releasing someone else's handle…
    expect(await take('technical')).toBeNull();       // …does not free A
    expect(await a.release()).toEqual({ released: true });
    expect(await a.release()).toEqual({ released: true });
    expect(a.isHeld()).toBe(false);
    await expect(a.assertHeld()).rejects.toMatchObject({ code: 'lock-lost' });
    expect(await take('technical')).not.toBeNull();
  });

  it('transaction rollback releases a transaction-level advisory lock', async () => {
    const key = scopeLockKey('article:rollback');
    await expect(prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${NS_SCOPE}::int4, ${key}::int4)`;
      throw new Error('boom');
    })).rejects.toThrow('boom');
    expect(await take('article:rollback')).not.toBeNull();
  });

  it('terminating the holding connection releases the lock; the old owner detects the loss and cannot reclaim it', async () => {
    const a = (await take('rodeo'))!;
    await prisma.$queryRaw`SELECT pg_terminate_backend(${a.pid}::int)`;
    await expect(a.assertHeld()).rejects.toMatchObject({ code: 'lock-lost' });
    expect(a.isHeld()).toBe(false);
    const b = await take('rodeo');                    // a new owner can acquire
    expect(b).not.toBeNull();
    const r = await a.release();                      // the old owner's release cannot touch B
    expect(r.released).toBe(false);
    await b!.assertHeld();
  });

  it('exceeding the hold ceiling ends ownership (no silent unprotected work)', async () => {
    const a = (await take('article:ceiling', { maxHoldMs: 1200 }))!;
    await new Promise((r) => setTimeout(r, 2200));
    await expect(a.assertHeld()).rejects.toMatchObject({ code: 'lock-lost' });
    expect(await take('article:ceiling')).not.toBeNull();
  });

  it('fails closed when PostgreSQL is unreachable (no handle, retryable "unavailable")', async () => {
    const dead = new PrismaClient({ datasources: { db: { url: 'postgresql://nobody:nothing@127.0.0.1:1/none?connect_timeout=2' } } });
    try {
      await expect(L.acquireAuditLock(dead, 'article:dead', { maxWaitMs: 3000 })).rejects.toMatchObject({ code: 'unavailable' });
    } finally { await dead.$disconnect().catch(() => {}); }
  });
});

pg('S7 — runAudit lifecycle on real PostgreSQL', () => {
  beforeAll(async () => {
    const u = await prisma.user.findFirst({ select: { id: true } });
    actorId = u?.id ?? (await prisma.user.create({ data: { email: `s7test-${Date.now()}@example.invalid`, name: 'S7 test' } })).id;
  });
  const running = (scope: string) => prisma.seoAuditRun.count({ where: { scope, status: 'running' } });

  it('two simultaneous same-scope audits: exactly one runs, the other gets "conflict"; nothing left running', async () => {
    const before = await prisma.seoAuditRun.count({ where: { status: 'completed' } });
    const r = await Promise.allSettled([orch.runAudit(prisma, { kind: 'full' }, actorId), orch.runAudit(prisma, { kind: 'full' }, actorId)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.filter((x) => x.status === 'rejected').map((x) => (x as PromiseRejectedResult).reason.code)).toEqual(['conflict']);
    expect(await running('full')).toBe(0);
    expect(await prisma.seoAuditRun.count({ where: { status: 'completed' } })).toBe(before + 1); // history kept, +1
  });

  it('different scopes run concurrently', async () => {
    const r = await Promise.allSettled([orch.runAudit(prisma, { kind: 'technical' }, actorId), orch.runAudit(prisma, { kind: 'rodeo' }, actorId)]);
    expect(r.map((x) => x.status)).toEqual(['fulfilled', 'fulfilled']);
  });

  it('an ACTIVE audit is never stolen, however old its row; once it ends, the row is recovered as abandoned', async () => {
    const live = (await take('technical'))!;
    const row = await prisma.seoAuditRun.create({ data: { scope: 'technical', engineVersion: 'x', status: 'running', startedAt: new Date('2020-01-01T00:00:00Z') } });
    await expect(orch.runAudit(prisma, { kind: 'technical' }, actorId)).rejects.toMatchObject({ code: 'conflict' });
    await expect(orch.runAudit(prisma, { kind: 'full' }, actorId)).rejects.toMatchObject({ code: 'conflict' });
    expect((await prisma.seoAuditRun.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('running'); // untouched
    await live.release(); open.splice(open.indexOf(live), 1);
    await orch.runAudit(prisma, { kind: 'technical' }, actorId);
    const after = await prisma.seoAuditRun.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.status).toBe('failed');
    expect(after.summary).toMatchObject({ reason: 'abandoned' });
  });

  it('interrupted audit (crashed owner) is recovered exactly once by two racing workers', async () => {
    const crashed = await prisma.seoAuditRun.create({ data: { scope: 'rodeo', engineVersion: 'x', status: 'running' } });
    const r = await Promise.allSettled([orch.runAudit(prisma, { kind: 'rodeo' }, actorId), orch.runAudit(prisma, { kind: 'rodeo' }, actorId)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.filter((x) => x.status === 'rejected').map((x) => (x as PromiseRejectedResult).reason.code)).toEqual(['conflict']);
    const after = await prisma.seoAuditRun.findUniqueOrThrow({ where: { id: crashed.id } });
    expect(after.status).toBe('failed');
    expect((after.summary as { recoveredBy?: string }).recoveredBy).toBeTruthy();
    expect(await running('rodeo')).toBe(0);
  });

  it('a failing audit is marked failed (not completed), releases the lock, and a retry succeeds', async () => {
    const failing = prisma.$extends({ query: { seoConfig: { async findUnique() { throw new Error('injected failure'); } } } }) as unknown as PrismaClient;
    await expect(orch.runAudit(failing, { kind: 'rodeo' }, actorId)).rejects.toThrow('injected failure');
    const last = await prisma.seoAuditRun.findFirstOrThrow({ where: { scope: 'rodeo' }, orderBy: { startedAt: 'desc' } });
    expect(last.status).toBe('failed');
    expect(last.summary).toMatchObject({ reason: 'error' });
    expect(await running('rodeo')).toBe(0);
    const retry = await orch.runAudit(prisma, { kind: 'rodeo' }, actorId);
    expect((await prisma.seoAuditRun.findUniqueOrThrow({ where: { id: retry.auditRunId } })).status).toBe('completed');
  });

  it('database unavailable → no audit run row is created and the error is retryable', async () => {
    const dead = new PrismaClient({ datasources: { db: { url: 'postgresql://nobody:nothing@127.0.0.1:1/none?connect_timeout=2' } } });
    const before = await prisma.seoAuditRun.count();
    try {
      await expect(orch.runAudit(dead, { kind: 'article', articleId: 'x' }, actorId)).rejects.toMatchObject({ code: 'unavailable' });
    } finally { await dead.$disconnect().catch(() => {}); }
    expect(await prisma.seoAuditRun.count()).toBe(before);
  });
});
