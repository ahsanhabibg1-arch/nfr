import { defineConfig, devices } from '@playwright/test';
import nextEnv from '@next/env';
import { decideTestDatabase } from './tests/support/testDbGuard';

/**
 * Browser smoke + accessibility tests (Batch A, A7). Dev-only tooling.
 *
 * Runs against `next start` on an ISOLATED, SEEDED test database only: the same guard as
 * Vitest (local host, `*_test`/`*_ci` database, never the dev or cloud database). The global
 * setup writes ephemeral test-only rows (a fixture admin with a random password, a legacy
 * SCHEDULED article, a redirect) into that database and the teardown removes them.
 *
 * Build first against the same database (`next build`) so statically generated pages reflect
 * the fixtures; CI does this in order. Locally: see the report for the exact commands.
 */
nextEnv.loadEnvConfig(process.cwd());
const db = decideTestDatabase(process.env);
if (db.mode !== 'isolated') {
  throw new Error(`Playwright refuses to run without an isolated test database: ${db.reason}`);
}

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3100';
const port = new URL(BASE_URL).port || '3100';

/**
 * Batch 02 Task F1 - the site origin must be the server under test.
 *
 * `NEXT_PUBLIC_SITE_URL` is INLINED AT BUILD TIME, so a bundle built with the
 * default `http://localhost:3000` keeps that origin no matter what this config
 * or the webServer env says. One spec then fetches `${SITE_URL}/robots.txt` and
 * `${SITE_URL}/sitemap.xml` through the admin indexing diagnostics, which
 * quietly report "Unreachable" unless something unrelated happens to be serving
 * on port 3000 - so the suite passed or failed depending on whether a developer
 * had a dev server running. That is the dependence this check removes: a
 * mismatch fails immediately, by name, instead of surfacing as one puzzling
 * assertion eleven minutes in.
 *
 * `npm run test:e2e` builds and runs with both values aligned, so the normal
 * path never trips this.
 */
const trimSlash = (u: string): string => u.replace(/[/]+$/, '');
if (trimSlash(process.env.NEXT_PUBLIC_SITE_URL || '') !== trimSlash(BASE_URL)) {
  throw new Error([
    'NEXT_PUBLIC_SITE_URL must equal the E2E base URL.',
    `  NEXT_PUBLIC_SITE_URL = ${process.env.NEXT_PUBLIC_SITE_URL || '(unset)'}`,
    `  E2E base URL         = ${BASE_URL}`,
    'It is baked into the build, so build and run with the same value -',
    'use "npm run test:e2e", which does that for you.',
  ].join('\n'));
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next start -p ${port}`,
    url: BASE_URL,
    // CI starts the server itself (and runs the HTTP route smoke against it) — reuse it.
    reuseExistingServer: true,
    timeout: 120_000,
    // MEDIA_STORAGE_PROVIDER is pinned for the same reason DATABASE_URL is: the
    // isolation guard refuses `APP_ENV=test` with cloud media ("tests must never
    // touch production storage"), so inheriting a developer's `.env` would stop
    // the test server booting the moment local development points at R2.
    env: { DATABASE_URL: db.databaseUrl, APP_ENV: 'test', MEDIA_STORAGE_PROVIDER: 'local' },
  },
});
