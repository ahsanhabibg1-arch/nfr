/**
 * Next.js startup hook (Batch 13). Runs once when the server process starts. Validates the
 * environment and the storage/database isolation BEFORE serving traffic:
 *   - production RUNTIME: fail fast (throw) on invalid or unsafe configuration.
 *   - development / test / build: warn only, so local workflows and `next build` are never
 *     broken by a strict production rule.
 * It only runs in the Node.js runtime and never prints secret values.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build';

  const { validateEnv } = await import('./lib/env');
  const { checkEnvConsistency } = await import('./lib/env-guard');
  const { log } = await import('./lib/logger');

  const envResult = validateEnv();
  const consistency = checkEnvConsistency();
  const problems = [...envResult.errors, ...consistency.problems];

  log.info('startup environment', { ...envResult.summary, db: consistency.db, storage: consistency.storage, maintenance: consistency.maintenance });

  if (problems.length > 0) {
    const enforce = envResult.env === 'production' && !isBuild;
    const msg = `environment ${enforce ? 'INVALID' : 'warnings'}: ${problems.join('; ')}`;
    if (enforce) { log.error(msg); throw new Error(msg); }
    log.warn(msg);
  }
}
