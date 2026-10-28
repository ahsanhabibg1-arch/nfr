import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

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
