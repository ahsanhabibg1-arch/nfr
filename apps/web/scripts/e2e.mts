/**
 * Batch 02 Task F1 — build and run the browser suite with ONE consistent
 * environment.
 *
 * The suite has three preconditions that must agree, and nothing used to make
 * them agree:
 *
 *   1. the isolated test database (never the dev or cloud database),
 *   2. LOCAL media storage — the isolation guard refuses `APP_ENV=test` with
 *      cloud media, so a developer whose `.env` points at R2 could not boot the
 *      test server at all,
 *   3. `NEXT_PUBLIC_SITE_URL` equal to the server under test. That value is
 *      INLINED AT BUILD TIME, so it has to be right for the BUILD, not just for
 *      the run — which is why a config setting alone could never fix it. With
 *      it wrong, the admin indexing diagnostics fetch port 3000 and report
 *      "Unreachable", and the suite silently depended on an unrelated dev
 *      server being up.
 *
 * `npm run test:e2e` is now this script, so the documented flow is one command
 * and the three values cannot drift apart. Pass extra Playwright arguments
 * straight through: `npm run test:e2e -- e2e/public.spec.ts`.
 */
import { spawnSync } from 'node:child_process';
import nextEnv from '@next/env';
import { decideTestDatabase } from '../tests/support/testDbGuard';

nextEnv.loadEnvConfig(process.cwd());

const db = decideTestDatabase(process.env);
if (db.mode !== 'isolated') {
  console.error(`Refusing to run the browser suite: ${db.reason}`);
  console.error('Set TEST_DATABASE_URL to a local *_test database and try again.');
  process.exit(2);
}

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3100';

/** The one environment both the build and the run must see. */
const env = {
  ...process.env,
  DATABASE_URL: db.databaseUrl,
  APP_ENV: 'test',
  MEDIA_STORAGE_PROVIDER: 'local',
  NEXT_PUBLIC_SITE_URL: BASE_URL,
};

console.log(`[e2e] database : ${db.target}`);
console.log(`[e2e] origin   : ${BASE_URL} (baked into the build)`);
console.log(`[e2e] media    : local (never cloud under APP_ENV=test)`);

const skipBuild = process.env.E2E_SKIP_BUILD === '1';
if (skipBuild) {
  console.log('[e2e] E2E_SKIP_BUILD=1 — reusing the existing build');
} else {
  console.log('[e2e] building against the test database...');
  const build = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', env, shell: true });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const passthrough = process.argv.slice(2);
const run = spawnSync('npx', ['playwright', 'test', ...passthrough], { stdio: 'inherit', env, shell: true });
process.exit(run.status ?? 1);
