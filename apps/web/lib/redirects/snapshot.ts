import { prisma } from '@/lib/db';
import { report } from '@/lib/logger';
import { isSupportedRedirectStatus, validateRedirectDestinationShape, validateRedirectSource } from './paths';
import { resolveLiveCanonical } from './resolve';

export interface ManagedRedirectSnapshotRow {
  targetPath: string;
  statusCode: 301 | 302 | 307 | 308;
}

const MAX_SNAPSHOT_ROWS = 5_000;
const SNAPSHOT_TTL_MS = 30_000;

type Snapshot = { rows: Map<string, ManagedRedirectSnapshotRow>; overflow: boolean };
const EMPTY_SNAPSHOT: Snapshot = { rows: new Map(), overflow: false };
type SnapshotState = {
  expiresAt: number;
  databaseVersion: bigint | null;
  current: Snapshot;
  generation: number;
  refresh: { generation: number; databaseVersion: bigint; promise: Promise<Snapshot> } | null;
};
const state: SnapshotState = {
  expiresAt: 0,
  databaseVersion: null,
  current: EMPTY_SNAPSHOT,
  generation: 0,
  refresh: null,
};

async function loadSnapshot(): Promise<Snapshot> {
  const found = await prisma.articleRedirect.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { sourcePath: 'asc' },
    take: MAX_SNAPSHOT_ROWS + 1,
    select: { sourcePath: true, targetPath: true, statusCode: true },
  });
  const overflow = found.length > MAX_SNAPSHOT_ROWS;
  const rows = new Map<string, ManagedRedirectSnapshotRow>();
  for (const row of found.slice(0, MAX_SNAPSHOT_ROWS)) {
    const source = validateRedirectSource(row.sourcePath);
    const destination = validateRedirectDestinationShape(row.targetPath, row.sourcePath);
    if (!source.ok || !source.path || !destination.ok || !destination.path || !isSupportedRedirectStatus(row.statusCode)) continue;
    rows.set(source.path, { targetPath: destination.path, statusCode: row.statusCode });
  }
  return { rows, overflow };
}

async function snapshot(): Promise<Snapshot> {
  let versionRow: { version: bigint } | null;
  try {
    versionRow = await prisma.redirectCacheState.findUnique({
      where: { id: 1 },
      select: { version: true },
    });
  } catch (error) {
    report('database', error, { fields: { operation: 'redirect_cache_generation_read' } });
    return EMPTY_SNAPSHOT;
  }
  if (!versionRow) {
    report('database', new Error('Redirect cache generation row is missing.'), {
      fields: { operation: 'redirect_cache_generation_read' },
    });
    return EMPTY_SNAPSHOT;
  }
  const databaseVersion = versionRow.version;
  if (state.databaseVersion === databaseVersion && Date.now() < state.expiresAt) return state.current;
  if (
    !state.refresh ||
    state.refresh.generation !== state.generation ||
    state.refresh.databaseVersion !== databaseVersion
  ) {
    const refreshGeneration = state.generation;
    let pending: Promise<Snapshot>;
    pending = loadSnapshot()
      .then(async (next) => {
        const latest = await prisma.redirectCacheState.findUnique({ where: { id: 1 }, select: { version: true } });
        if (!latest) throw new Error('Redirect cache generation row is missing.');
        if (latest.version !== databaseVersion || state.generation !== refreshGeneration) return snapshot();
        state.current = next;
        state.databaseVersion = databaseVersion;
        state.expiresAt = Date.now() + SNAPSHOT_TTL_MS;
        return next;
      })
      .catch((error) => {
        report('database', error, { fields: { operation: 'redirect_snapshot_refresh' } });
        if (state.generation === refreshGeneration) {
          state.current = EMPTY_SNAPSHOT;
          state.databaseVersion = null;
          state.expiresAt = Date.now() + 1_000;
        }
        return EMPTY_SNAPSHOT;
      })
      .finally(() => {
        if (state.refresh?.promise === pending) state.refresh = null;
      });
    state.refresh = { generation: refreshGeneration, databaseVersion, promise: pending };
  }
  const pending = state.refresh;
  if (!pending) return snapshot();
  const result = await pending.promise;
  return pending.generation === state.generation && pending.databaseVersion === databaseVersion
    ? result
    : snapshot();
}

async function findOverflowRow(sourcePath: string): Promise<ManagedRedirectSnapshotRow | null> {
  const row = await prisma.articleRedirect.findFirst({
    where: { sourcePath, status: 'ACTIVE' },
    select: { sourcePath: true, targetPath: true, statusCode: true },
  });
  if (!row) return null;
  const source = validateRedirectSource(row.sourcePath);
  const destination = validateRedirectDestinationShape(row.targetPath, row.sourcePath);
  if (!source.ok || !source.path || !destination.ok || !destination.path || !isSupportedRedirectStatus(row.statusCode)) return null;
  return { targetPath: destination.path, statusCode: row.statusCode };
}

/** A small DB generation read detects writes across Proxy and Server Action bundles. */
export async function resolveManagedRedirectAtBoundary(pathname: string): Promise<ManagedRedirectSnapshotRow | null> {
  const source = validateRedirectSource(pathname);
  if (!source.ok || !source.path) return null;
  const loaded = await snapshot();
  let row: ManagedRedirectSnapshotRow | null;
  try {
    row = loaded.rows.get(source.path) ?? (loaded.overflow ? await findOverflowRow(source.path) : null);
  } catch (error) {
    report('database', error, { fields: { operation: 'redirect_snapshot_overflow_lookup' } });
    return null;
  }
  if (!row) return null;
  try {
    // A stale local snapshot must never shadow a path that has since become canonical.
    if (await resolveLiveCanonical(source.path)) return null;
    // Liveness and current canonical destination are intentionally re-proved for
    // matched redirects so stale snapshots cannot expose unpublished content.
    const canonical = await resolveLiveCanonical(row.targetPath);
    if (!canonical || canonical === source.path) return null;
    return { targetPath: canonical, statusCode: row.statusCode };
  } catch (error) {
    report('database', error, { fields: { operation: 'redirect_liveness_check' } });
    return null;
  }
}

/** Used after a local commit; other processes also detect the durable generation change. */
export function clearManagedRedirectSnapshot(): void {
  state.generation++;
  state.expiresAt = 0;
  state.databaseVersion = null;
  state.current = EMPTY_SNAPSHOT;
  state.refresh = null;
}
