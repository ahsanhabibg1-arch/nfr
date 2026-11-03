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
    env: { DATABASE_URL: db.databaseUrl, APP_ENV: 'test' },
  },
});
