import 'server-only';
import type { Prisma } from '@prisma/client';
import { normalizeRedirectPath, isReservedPath } from './paths';

/**
 * The one way a redirect is written.
 *
 * WHY THIS EXISTS (Stage 03, D-3). Two services wrote redirects and they did
 * not agree:
 *
 *   - `articleService.claimPath` set a conflicting row to DISABLED;
 *     `rodeoSlugs` DELETED it. One preserved history, the other destroyed it,
 *     and which you got depended on whether you had renamed an article or a
 *     venue.
 *   - `articleService` flattened chains matching `status: 'ACTIVE'`;
 *     `rodeoSlugs` flattened every row regardless of status, so a disabled
 *     historical record could be silently rewritten as a side effect of an
 *     unrelated rename.
 *   - Neither looked at `statusCode` when flattening, so a deliberate
 *     temporary redirect would have been re-pointed as if it were permanent.
 *
 * All three are settled here, once: DISABLE rather than delete, flatten only
 * ACTIVE rows, and flatten only PERMANENT ones.
 *
 * Every function takes a `Prisma.TransactionClient`, because a redirect write
 * is only ever correct as part of the entity mutation that caused it. That
 * contract was already right in both services and is preserved exactly.
 */

/** Status codes a chain may be flattened through. */
const PERMANENT_CODES = [301, 308];

/**
 * Serialize redirect-graph mutations inside PostgreSQL. Source uniqueness alone
 * cannot prevent two different writers from concurrently creating a cycle.
 * A database trigger updates the durable snapshot generation transactionally.
 */
export async function lockRedirectGraph(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('nfrguide:redirect-graph'))`;
}

/**
 * Drop the cached redirect lookups.
 *
 * CALL THIS AFTER THE TRANSACTION COMMITS, never inside it. Invalidating from
 * within would publish the new state to readers before it is durable, and a
 * rollback would then leave the cache advertising a redirect that does not
 * exist. Every caller here takes a transaction client, so none of them can
 * safely do it themselves — it is the mutation service's job, once its
 * `$transaction` has returned.
 *
 * Failure is swallowed deliberately. A missed invalidation costs at most one
 * TTL of staleness on a 308; an exception thrown here, after a successful
 * commit, would report a completed rename as failed.
 *
 * WHICH NEXT 16 CALL. `updateTag` is the read-your-own-writes form and is the
 * right semantics after a mutation — an editor who renames a slug should not
 * then be served the old redirect. It is restricted to Server Action
 * contexts, which is where these services run, so `revalidateTag` is kept as
 * the fallback for any other caller. Next 16 changed `revalidateTag` to
 * require a cache-life profile, hence the second argument; `'max'` means
 * "expire it", not "keep it for a long time".
 */
export async function invalidateRedirectCache(): Promise<void> {
  try {
    (await import('./resolve')).clearRedirectLookupCache();
    (await import('./snapshot')).clearManagedRedirectSnapshot();
  } catch {
    // Other processes self-correct within the bounded TTL.
  }
  try {
    const cache = (await import('next/cache')) as {
      updateTag?: (tag: string) => void;
      revalidateTag?: (tag: string, profile: string) => void;
    };
    if (typeof cache.updateTag === 'function') {
      cache.updateTag('redirects');
      return;
    }
    cache.revalidateTag?.('redirects', 'max');
  } catch {
    // No Next runtime (unit tests, scripts), or not a Server Action context.
    // A missed invalidation self-corrects within the lookup TTL.
  }
}

/** The sub-routes an edition serves below its own URL. */
export const EDITION_SUB_TABS = ['schedule', 'results', 'standings'] as const;

/**
 * Disable every ACTIVE redirect whose SOURCE is `path`.
 *
 * Called when a live entity takes ownership of a path: the entity must win, or
 * the redirect would shadow a real page and send readers away from content
 * that exists. The row is kept, not deleted — it is the historical record that
 * the path once moved, and Stage 04's admin UI will want to show it.
 *
 * Returns the number of rows disabled, so callers can report it in an audit.
 */
export async function claimCanonicalPath(tx: Prisma.TransactionClient, path: string): Promise<number> {
  const p = normalizeRedirectPath(path);
  if (!p) return 0;
  await lockRedirectGraph(tx);
  const r = await tx.articleRedirect.updateMany({
    where: { sourcePath: p, status: 'ACTIVE' },
    data: { status: 'DISABLED' },
  });
  return r.count;
}

/**
 * Re-point every ACTIVE PERMANENT redirect that aimed at `from` so it aims at
 * `to` instead.
 *
 * This is what keeps the graph one hop deep: A→B and then B→C leaves A→C
 * rather than A→B→C, so no reader and no crawler ever walks a chain.
 *
 * TWO DELIBERATE EXCLUSIONS.
 *
 * `status: 'ACTIVE'` — a DISABLED row is history. Rewriting it would corrupt
 * the record of where a path used to point, for no benefit: it is not served.
 *
 * `statusCode in (301, 308)` — a temporary redirect means "this is where you
 * go for now", and its destination is a deliberate choice rather than a
 * forwarding address. Re-pointing it at whatever the permanent graph settled
 * on would silently change what the author asked for. Nothing writes a
 * temporary row today, so this changes no existing data; it is here so that
 * Stage 04's manual creation cannot be quietly broken by an unrelated rename.
 */
export async function flattenPermanentChain(
  tx: Prisma.TransactionClient,
  from: string,
  to: string,
): Promise<number> {
  const f = normalizeRedirectPath(from);
  const t = normalizeRedirectPath(to);
  if (!f || !t || f === t) return 0;
  const r = await tx.articleRedirect.updateMany({
    where: { targetPath: f, status: 'ACTIVE', statusCode: { in: PERMANENT_CODES } },
    data: { targetPath: t },
  });
  return r.count;
}

export interface MoveResult {
  written: boolean;
  /** Rows re-pointed at the new destination. */
  flattened: number;
  /** Rows disabled because the destination is now a live canonical path. */
  reclaimed: number;
}

/**
 * Record that `from` has become `to`: the complete, ordered move.
 *
 * The order matters and is the same in every caller:
 *
 *   1. the destination is claimed, so no stale redirect can shadow it;
 *   2. everything that pointed at the old path is re-pointed at the new one;
 *   3. the old path itself is upserted as a permanent redirect.
 *
 * Doing (3) before (2) would make the new row a target of its own flatten pass.
 * Doing (1) last would leave a window where the destination both serves content
 * and redirects away from it.
 *
 * Returns `written: false` when there is nothing to do — the paths are equal,
 * either is malformed, or either is a reserved infrastructure path. A reserved
 * path is refused rather than recorded: a redirect out of `/admin/` would
 * shadow the real route, and one into `/api/` would point readers at an
 * endpoint instead of a page.
 */
export async function writeMoveRedirect(
  tx: Prisma.TransactionClient,
  from: string,
  to: string,
  statusCode = 308,
): Promise<MoveResult> {
  const f = normalizeRedirectPath(from);
  const t = normalizeRedirectPath(to);
  if (!f || !t || f === t) return { written: false, flattened: 0, reclaimed: 0 };
  if (isReservedPath(f) || isReservedPath(t)) return { written: false, flattened: 0, reclaimed: 0 };

  const reclaimed = await claimCanonicalPath(tx, t);
  const flattened = await flattenPermanentChain(tx, f, t);
  await tx.articleRedirect.upsert({
    where: { sourcePath: f },
    update: { targetPath: t, statusCode, status: 'ACTIVE' },
    create: { sourcePath: f, targetPath: t, statusCode, status: 'ACTIVE', origin: 'AUTOMATIC' },
  });
  return { written: true, flattened, reclaimed };
}
