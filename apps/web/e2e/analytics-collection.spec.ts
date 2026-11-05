import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import type { PrismaClient } from '@prisma/client';
import { FIXTURE_SLUGS } from '../prisma/fixtures';
import { E2E_DIR, readState, testDb } from './support';

/**
 * Batch 26 — first-party analytics END-TO-END (Phase I). Exercises the real journey the
 * unit tests cannot: browser beacon → same-origin HTTP endpoint → DB → admin dashboard.
 * Collection is enabled ONLY in this isolated test database for the duration of the run and
 * reset afterwards; the production default stays disabled. Uses no identifiers.
 */
const CONFIG_KEY = 'settings';
const BASE_SETTINGS = { searchLoggingEnabled: true, contentViewEnabled: true, retentionDays: 180, redactQueries: true, displayTimeZone: 'UTC' };

async function setCollection(db: PrismaClient, enabled: boolean) {
  await db.analyticsConfig.upsert({
    where: { key: CONFIG_KEY },
    create: { key: CONFIG_KEY, value: { ...BASE_SETTINGS, collectionEnabled: enabled } },
    update: { value: { ...BASE_SETTINGS, collectionEnabled: enabled } },
  });
}

async function wipeEvents(db: PrismaClient) {
  await db.contentViewEvent.deleteMany({});
  await db.searchQueryEvent.deleteMany({});
  await db.searchResultClickEvent.deleteMany({});
  await db.analyticsDailyAggregate.deleteMany({});
}

/** Poll the DB until `fn` returns a truthy value or the timeout elapses (beacons are async). */
async function waitFor<T>(fn: () => Promise<T>, timeoutMs = 10000): Promise<T> {
  const start = Date.now();
  let last: T;
  do {
    last = await fn();
    if (last) return last;
    await new Promise((r) => setTimeout(r, 300));
  } while (Date.now() - start < timeoutMs);
  return last!;
}

async function articleId(db: PrismaClient): Promise<string> {
  return (await db.article.findFirstOrThrow({ where: { slug: FIXTURE_SLUGS.publishedArticle }, select: { id: true } })).id;
}

async function loginAsFixtureAdmin(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

test.describe.configure({ mode: 'serial' });

test.describe('first-party analytics collection (end-to-end)', () => {
  test.beforeAll(async () => {
    const db = testDb();
    try { await wipeEvents(db); await setCollection(db, true); } finally { await db.$disconnect(); }
  });
  test.afterAll(async () => {
    const db = testDb();
    try { await setCollection(db, false); await wipeEvents(db); } finally { await db.$disconnect(); }
  });

  test('a public journey records view, search, click and zero-result events via the real endpoint', async ({ page }) => {
    const db = testDb();
    try {
      const id = await articleId(db);

      // 1) Public article view → ViewBeacon → content_view event for the published article.
      await page.goto(`/articles/${FIXTURE_SLUGS.publishedArticle}/`);
      const view = await waitFor(() => db.contentViewEvent.findFirst({ where: { entityType: 'ARTICLE', entityId: id } }));
      expect(view, 'a content_view event was recorded for the article').toBeTruthy();

      // 2) Internal search with results → search event (not zero-result).
      await page.goto('/search/?q=fixture');
      const search = await waitFor(() => db.searchQueryEvent.findFirst({ where: { zeroResult: false } }));
      expect(search, 'a non-zero search event was recorded').toBeTruthy();

      // 3) Click a search result → search_click event (fires before navigation, keepalive).
      const firstResult = page.locator('main a[href^="/articles/"], main a[href^="/disciplines/"], main a[href^="/rodeo-events/"]').first();
      await expect(firstResult).toBeVisible();
      await firstResult.click();
      const click = await waitFor(() => db.searchResultClickEvent.findFirst({}));
      expect(click, 'a search_click event was recorded').toBeTruthy();

      // 4) Zero-result search → zeroResult event.
      await page.goto('/search/?q=zzqxqnoresultsxyz');
      const zero = await waitFor(() => db.searchQueryEvent.findFirst({ where: { zeroResult: true } }));
      expect(zero, 'a zero-result search event was recorded').toBeTruthy();

      // Aggregates were bumped in the same transaction as the raw events.
      expect(await db.analyticsDailyAggregate.count()).toBeGreaterThan(0);
    } finally {
      await db.$disconnect();
    }
  });

  test('the admin dashboard reflects the recorded events (collection ACTIVE)', async ({ page }) => {
    await loginAsFixtureAdmin(page);
    await page.goto('/admin/analytics/');
    await expect(page.getByText(/First-party collection:\s*ACTIVE/i)).toBeVisible();
    // The "Content Views" KPI card shows a non-zero observed-view count.
    await expect(page.getByTestId('stat-content-views')).toContainText(/[1-9]/);
    // Screenshot for the batch-26 docs (Phase J) — the dashboard with live first-party data.
    await page.screenshot({ path: path.join(E2E_DIR, '..', '..', '..', 'docs', 'batches', 'batch-26', 'analytics-dashboard.png'), fullPage: false });
  });

  test('disabling collection stops new events from being recorded', async ({ page }) => {
    const db = testDb();
    try {
      await setCollection(db, false);
      const before = await db.searchQueryEvent.count();
      // A fresh query term (not deduped) that would be recorded if collection were on.
      await page.goto('/search/?q=disabledprobe');
      await page.waitForTimeout(1500);
      const after = await db.searchQueryEvent.count();
      expect(after).toBe(before); // no new event while disabled
    } finally {
      await db.$disconnect();
    }
  });
});
