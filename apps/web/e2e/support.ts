import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';
import { PrismaClient } from '@prisma/client';
import { decideTestDatabase } from '../tests/support/testDbGuard';

/** The e2e/ directory (ESM package — no __dirname). */
export const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Ephemeral e2e state written by global-setup (git-ignored). Contains a test-only credential. */
export const STATE_FILE = path.join(E2E_DIR, '.auth', 'e2e-state.json');

export interface E2EState {
  runId: string;
  adminEmail: string;
  adminPassword: string;
  adminUserId: string;
  scheduledArticleId: string;
  scheduledArticleSlug: string;
  redirectSource: string;
  redirectTarget: string;
}

/** Prisma client bound to the guarded, isolated test database (throws otherwise). */
export function testDb(): PrismaClient {
  nextEnv.loadEnvConfig(path.resolve(E2E_DIR, '..'));
  const d = decideTestDatabase(process.env);
  if (d.mode !== 'isolated') throw new Error(`e2e refuses to touch a non-test database: ${d.reason}`);
  return new PrismaClient({ datasourceUrl: d.databaseUrl });
}

export function readState(): E2EState {
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as E2EState;
}
