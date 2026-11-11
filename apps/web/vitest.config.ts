import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';
import { decideTestDatabase } from './tests/support/testDbGuard';

// Match Next's local env loading, then force integration tests onto the
// disposable database. A test run must never mutate the development database.
nextEnv.loadEnvConfig(process.cwd());
const testDb = decideTestDatabase(process.env);
if (testDb.mode === 'refused') {
  throw new Error(`Refusing to run tests: ${testDb.reason}`);
}
// CI sets REQUIRE_DB_TESTS=1: a missing test database is a failure, not a silent skip.
if (process.env.REQUIRE_DB_TESTS === '1' && testDb.mode !== 'isolated') {
  throw new Error(`REQUIRE_DB_TESTS=1 but no isolated test database is configured: ${testDb.reason}`);
}
// Without an isolated test DB, blank DATABASE_URL so DB suites self-skip instead of
// falling back to the development database. (Empty, not deleted, so nothing re-fills it.)
process.env.DATABASE_URL = testDb.mode === 'isolated' ? testDb.databaseUrl : '';
console.info(testDb.mode === 'isolated' ? `[tests] isolated DB: ${testDb.target}` : `[tests] ${testDb.reason}`);

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws outside a React Server Component bundler context,
      // which breaks importing server modules (lib/db, lib/content) under the
      // plain-Node vitest runtime. Alias it to a no-op stub for tests only.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
      // Mirror tsconfig's `@/*` -> `./*` so tests can import the same modules the
      // app does. Required to render real block components (Stage 03).
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // DB integration tests may connect to a real database; give them room.
    //
    // Raised from 30s in Stage 04. `tests/seo-intel.test.ts` runs full audit
    // passes against the test database: individual cases take 21-25s even in
    // isolation, so they sat just inside the old limit and began timing out once
    // Stage 03/04 added ~270 tests of concurrent load. They pass 12/12 when the
    // file is run alone. No assertion was changed — only the allowance for a
    // genuinely slow DB suite.
    testTimeout: 90000,
    hookTimeout: 90000,
    // Some DB suites toggle shared singleton config rows (AnalyticsConfig,
    // MonetizationConfiguration). Run test files serially so those globals are
    // deterministic across suites (tests within a file already run in order).
    fileParallelism: false,
  },
});
