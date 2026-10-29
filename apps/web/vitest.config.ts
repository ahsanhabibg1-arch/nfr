import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';

// Match Next's local env loading, then force integration tests onto the
// disposable database. A test run must never mutate the development database.
nextEnv.loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws outside a React Server Component bundler context,
      // which breaks importing server modules (lib/db, lib/content) under the
      // plain-Node vitest runtime. Alias it to a no-op stub for tests only.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // DB integration tests may connect to a real database; give them room.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
