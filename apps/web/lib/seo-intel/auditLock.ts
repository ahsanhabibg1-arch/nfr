import 'server-only';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { log } from '../logger';

/**
 * Batch S / S7 — SEO audit concurrency lock (PostgreSQL transaction-level advisory locks).
 *
 * Why transaction-level, held by a Prisma interactive transaction
 *   Prisma pools connections, so a SESSION advisory lock taken through `$queryRaw` could be
 *   acquired on one pooled connection and released (or left held) on another. An interactive
 *   `$transaction(async (tx) => …)` pins ONE connection for its whole life; a
 *   `pg_try_advisory_xact_lock` taken inside it is held until that transaction ends and can
 *   be released by nothing else. If the process crashes or the connection drops, PostgreSQL
 *   ends the transaction and releases the lock automatically.
 *   The holding transaction only runs two SELECTs and then waits: it takes no row locks,
 *   gets no transaction id and keeps no snapshot between statements (READ COMMITTED), so it
 *   does not block writes or vacuum. It occupies one pooled connection while the audit runs
 *   (the audit's own queries use other pooled connections — connection_limit must be ≥ 2).
 *
 * Liveness
 *   The advisory lock — not a database row and not elapsed time — is the proof that an audit
 *   is active. Whoever holds a scope's lock knows no other live audit of that scope exists, so
 *   `running` rows for it are abandoned and can be recovered (see orchestrator.runAudit).
 *
 * Keys (two-int4 form, a key space separate from the single-bigint form)
 *   GLOBAL  (NS_GLOBAL, 0)                    'full' takes it EXCLUSIVE; every other scope SHARED
 *   SCOPE   (NS_SCOPE,  int32(sha1(scopeKey)))  exclusive per logical scope
 *   ⇒ full excludes everything; the same scope excludes itself; different narrow scopes run
 *   in parallel. Keys are deterministic (never random). Two distinct scope strings that hash
 *   to the same int32 (≈1 in 4.3e9 per pair) only SERIALISE with each other — a collision can
 *   cause an unnecessary "busy", never two owners of one scope.
 *
 * Hold limit
 *   The holding transaction has a hard ceiling (DEFAULT_MAX_HOLD_MS). If it is exceeded, or the
 *   connection is lost, the handle reports `isHeld() === false`; the audit checks this at its
 *   checkpoints and fails with `lock-lost` instead of finishing unprotected.
 */

export const NS_GLOBAL = 0x4e465247; // "NFRG"
export const NS_SCOPE = 0x4e465253;  // "NFRS"
export const GLOBAL_KEY = 0;
export const FULL_SCOPE = 'full';
/** Hard ceiling for holding the lock (audits normally take seconds). */
export const DEFAULT_MAX_HOLD_MS = 30 * 60 * 1000;
/** How long to wait for a pooled connection to open the holding transaction. */
export const DEFAULT_MAX_WAIT_MS = 10 * 1000;

/** Deterministic signed int32 for a scope key (first 4 bytes of SHA-1). */
export function scopeLockKey(scopeKey: string): number {
  return crypto.createHash('sha1').update(scopeKey, 'utf8').digest().readInt32BE(0);
}

export interface AuditLockHandle {
  /** Unique id of this execution's ownership (recorded on the audit run). */
  readonly ownerId: string;
  readonly scopeKey: string;
  /** PostgreSQL backend pid of the connection that holds the lock. */
  readonly pid: number;
  /** True while the holding transaction is open (i.e. the advisory locks are held). */
  isHeld(): boolean;
  /** Why the lock was lost, if it was (connection terminated, hold limit exceeded, …). */
  lostReason(): string | undefined;
  /**
   * Verify the lock is really held: one query on the PINNED connection checking pg_locks for
   * this backend's granted scope lock. Detects a terminated connection immediately (the query
   * fails). Throws `lock-lost` when not held. Called at audit checkpoints only (no polling).
   */
  assertHeld(): Promise<void>;
  /** End the holding transaction (releases the locks). Idempotent; never throws. */
  release(): Promise<{ released: boolean; lostReason?: string }>;
}

export type AcquireResult = { ok: true; handle: AuditLockHandle } | { ok: false; reason: 'busy' };

export class AuditLockError extends Error {
  constructor(public readonly code: 'unavailable' | 'lock-lost', message: string) { super(message); this.name = 'AuditLockError'; }
}

/**
 * Try to acquire the audit lock for `scopeKey` without waiting for other holders.
 * - `{ ok: true, handle }` — acquired; caller MUST call `handle.release()` (finally).
 * - `{ ok: false, reason: 'busy' }` — another live audit holds a conflicting lock.
 * - throws `AuditLockError('unavailable')` — the database could not provide the lock
 *   (fail closed: the caller must not run the audit unprotected).
 */
export async function acquireAuditLock(
  db: PrismaClient,
  scopeKey: string,
  opts: { maxHoldMs?: number; maxWaitMs?: number } = {},
): Promise<AcquireResult> {
  const ownerId = crypto.randomUUID();
  const exclusiveGlobal = scopeKey === FULL_SCOPE;
  const key2 = scopeLockKey(scopeKey);

  let settleAcquire!: (r: { ok: true; pid: number } | { ok: false }) => void;
  let failAcquire!: (e: unknown) => void;
  const acquired = new Promise<{ ok: true; pid: number } | { ok: false }>((res, rej) => { settleAcquire = res; failAcquire = rej; });
  let signalRelease!: () => void;
  const releaseSignal = new Promise<void>((res) => { signalRelease = res; });

  let decided = false;
  let held = false;
  let lost: string | undefined;
  let pinned: { $queryRaw: PrismaClient['$queryRaw'] } | null = null;

  const txDone = db.$transaction(async (tx) => {
    pinned = tx;
    const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    const [g] = exclusiveGlobal
      ? await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(${NS_GLOBAL}::int4, ${GLOBAL_KEY}::int4) AS ok`
      : await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock_shared(${NS_GLOBAL}::int4, ${GLOBAL_KEY}::int4) AS ok`;
    if (!g.ok) { decided = true; settleAcquire({ ok: false }); return; }
    const [s] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(${NS_SCOPE}::int4, ${key2}::int4) AS ok`;
    if (!s.ok) { decided = true; settleAcquire({ ok: false }); return; } // tx ends → the shared global lock is released too
    held = true; decided = true;
    settleAcquire({ ok: true, pid: Number(pid) });
    await releaseSignal; // keep the transaction (and the locks) open until release()
  }, { maxWait: opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS, timeout: opts.maxHoldMs ?? DEFAULT_MAX_HOLD_MS });

  const finished = txDone.then(
    () => { held = false; },
    (e: unknown) => {
      if (held) {
        lost = e instanceof Error ? e.message.slice(0, 200) : 'holding transaction ended unexpectedly';
        log.warn('seo.audit.lock.lost', { scopeKey, ownerId, reason: lost });
      }
      held = false;
      if (!decided) { decided = true; failAcquire(e); }
    },
  );

  let result: { ok: true; pid: number } | { ok: false };
  try {
    result = await acquired;
  } catch (e) {
    // Fail closed — never report "acquired" without the database lock.
    log.error('seo.audit.lock.unavailable', { scopeKey, error: e instanceof Error ? e.name : 'unknown' });
    throw new AuditLockError('unavailable', 'The SEO audit lock is temporarily unavailable; please retry.');
  }
  if (!result.ok) { await finished; return { ok: false, reason: 'busy' }; }

  const pid = result.pid;
  let releasing: Promise<{ released: boolean; lostReason?: string }> | null = null;
  const handle: AuditLockHandle = {
    ownerId, scopeKey, pid,
    isHeld: () => held,
    lostReason: () => lost,
    async assertHeld() {
      const fail = () => new AuditLockError('lock-lost', `SEO audit lock for "${scopeKey}" was lost${lost ? `: ${lost}` : ''}.`);
      if (!held || !pinned) throw fail();
      try {
        // Two-int4 advisory keys appear in pg_locks as classid=key1, objid=key2, objsubid=2.
        const [r] = await pinned.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM pg_locks
          WHERE locktype = 'advisory' AND granted AND pid = pg_backend_pid()
            AND classid = ${NS_SCOPE}::int8::oid AND objid = ${key2 >>> 0}::int8::oid AND objsubid = 2`;
        if (r.n !== 1) { lost = lost ?? 'advisory lock not present on the holding connection'; held = false; }
      } catch (e) {
        lost = lost ?? (e instanceof Error ? e.message.slice(0, 200) : 'holding connection unusable');
        held = false;
      }
      if (!held) { log.warn('seo.audit.lock.lost', { scopeKey, ownerId, reason: lost }); throw fail(); }
    },
    release() {
      if (!releasing) {
        signalRelease();
        releasing = finished.then(() => ({ released: !lost, ...(lost ? { lostReason: lost } : {}) }));
      }
      return releasing;
    },
  };
  return { ok: true, handle };
}
