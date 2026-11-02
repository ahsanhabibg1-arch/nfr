import 'server-only';
import { appEnv } from './env';

/**
 * Environment isolation guard (Batch 13 §5). Prevents unsafe combinations of database
 * target and media-storage backend — e.g. a LOCAL development database wired to PRODUCTION
 * R2, or a CLOUD database wired to LOCAL filesystem media. Classification uses BOTH the
 * explicit `APP_ENV` label and the actual destination characteristics (never a hostname
 * heuristic alone).
 *
 * Maintenance scripts (cloud-db / cloud-data-import / r2-verify) intentionally touch cloud
 * resources; they do NOT import this guard (it is wired only into the app runtime via
 * instrumentation + the readiness endpoint). An explicit, auditable `APP_MAINTENANCE=1`
 * escape is also honored, and it never grants unrestricted production mutation — it only
 * suppresses the consistency assertion for a deliberately-scoped maintenance process.
 */

export type DbClass = 'local' | 'cloud' | 'unknown';
export type StorageClass = 'local' | 'cloud';

/** Classify a database URL by destination characteristics. */
export function classifyDatabase(url = process.env.DATABASE_URL): DbClass {
  if (!url) return 'unknown';
  let host = '';
  try { host = new URL(url.replace(/^psql\s+/i, '').replace(/^['"]|['"]$/g, '')).hostname; } catch { return 'unknown'; }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) return 'local';
  // Any non-loopback host is treated as a (cloud/remote) managed database.
  return 'cloud';
}

/** Classify the media storage backend. */
export function classifyStorage(provider = process.env.MEDIA_STORAGE_PROVIDER): StorageClass {
  const p = (provider || 'local').toLowerCase();
  return p === 'r2' || p === 's3' ? 'cloud' : 'local';
}

export interface ConsistencyResult { ok: boolean; problems: string[]; db: DbClass; storage: StorageClass; env: string; maintenance: boolean }

/** Evaluate (without throwing) whether the DB target and storage backend are consistent. */
export function checkEnvConsistency(): ConsistencyResult {
  const env = appEnv();
  const db = classifyDatabase();
  const storage = classifyStorage();
  const maintenance = process.env.APP_MAINTENANCE === '1';
  const problems: string[] = [];

  if (!maintenance) {
    // Core rule: database and media storage must live in the SAME environment tier.
    if (db === 'local' && storage === 'cloud') problems.push('local database + CLOUD media storage (R2/S3) — blobs would be written to production storage while metadata stays local');
    if (db === 'cloud' && storage === 'local') problems.push('cloud database + LOCAL filesystem media — production records would reference local-only files');
    // Label vs destination.
    if (env === 'production' && db === 'local') problems.push('APP_ENV=production but DATABASE_URL targets a local database');
    if (env === 'test' && storage === 'cloud') problems.push('APP_ENV=test but media storage is cloud (R2/S3) — tests must never touch production storage');
    if (db === 'unknown') problems.push('DATABASE_URL could not be classified (missing or unparseable)');
  }

  return { ok: problems.length === 0, problems, db, storage, env, maintenance };
}

/** Throw a secret-free error on an unsafe environment combination. Honors APP_MAINTENANCE. */
export function assertEnvConsistency(): void {
  const r = checkEnvConsistency();
  if (!r.ok) throw new Error(`Unsafe environment combination (env=${r.env}, db=${r.db}, storage=${r.storage}): ${r.problems.join('; ')}`);
}
