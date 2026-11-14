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

/**
 * Open one of the article editor's workspace areas.
 *
 * The editor is a TAB SET — Writing, Setup, SEO, Review — and only the selected
 * area is displayed; the others stay mounted but `hidden`, so their controls
 * remain attached to the DOM while being neither visible nor focusable.
 *
 * Specs written before that reorganisation reach straight for a field and fail
 * in a way that reads like a missing feature: `toBeVisible()` says "hidden",
 * `.focus()` silently leaves focus on <body>, and an axe scan sees a control
 * that cannot be reached. The field is present and working — it is simply on
 * another tab. Calling this first is the browser equivalent of the click a user
 * would make, and it keeps those assertions about the product rather than about
 * the default tab.
 */
export async function openEditorArea(
  page: import('@playwright/test').Page,
  area: 'writing' | 'setup' | 'seo' | 'review',
): Promise<void> {
  const tab = page.getByTestId(`editor-area-tab-${area}`);
  await tab.waitFor({ state: 'visible' });
  await tab.click();
  await page.locator(`[data-editor-area="${area}"]:not([hidden])`).first().waitFor({ state: 'visible' });
}
