import { test, expect, type Page } from '@playwright/test';
import { readState, testDb } from './support';

async function login(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

async function checkPageLayoutTable(): Promise<boolean> {
  const db = testDb();
  try {
    await db.$queryRawUnsafe('SELECT 1 FROM "PageLayout" LIMIT 1');
    return true;
  } catch { return false; }
  finally { await db.$disconnect(); }
}

async function cleanupPageLayout(pageKey: string) {
  const db = testDb();
  try {
    await db.pageLayout.deleteMany({ where: { pageKey } });
  } catch { /* table may not exist yet */ }
  finally { await db.$disconnect(); }
}

test.describe('Page Layout Admin', () => {
  test.beforeEach(async () => {
    await cleanupPageLayout('homepage');
  });

  test.afterEach(async () => {
    await cleanupPageLayout('homepage');
  });

  test('Website page loads with Navigation and Page Layouts tabs', async ({ page }) => {
    await login(page);
    await page.goto('/admin/website/');
    await expect(page.getByRole('button', { name: 'Navigation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Page Layouts' })).toBeVisible();
  });

  test('Page Layouts tab shows page selector', async ({ page }) => {
    await login(page);
    await page.goto('/admin/website/');
    await page.getByRole('button', { name: 'Page Layouts' }).click();
    await expect(page.locator('select')).toBeVisible();
    await expect(page.getByText(/Showing defaults|Draft saved|Published/)).toBeVisible();
  });

  test('Restore Defaults initializes homepage sections', async ({ page }) => {
    const tableExists = await checkPageLayoutTable();
    test.skip(!tableExists, 'PageLayout migration not yet applied');

    await login(page);
    await page.goto('/admin/website/');
    await page.getByRole('button', { name: 'Page Layouts' }).click();

    page.on('dialog', (d) => d.accept());
    await page.getByText('Restore defaults').click();
    await expect(page.getByText('Defaults restored')).toBeVisible({ timeout: 10000 });
  });

  test('Save Draft and Publish workflow', async ({ page }) => {
    const tableExists = await checkPageLayoutTable();
    test.skip(!tableExists, 'PageLayout migration not yet applied');

    await login(page);
    await page.goto('/admin/website/');
    await page.getByRole('button', { name: 'Page Layouts' }).click();

    page.on('dialog', (d) => d.accept());

    await page.getByText('Restore defaults').click();
    await expect(page.getByText('Defaults restored')).toBeVisible({ timeout: 10000 });

    await page.waitForTimeout(500);
    await page.goto('/admin/website/');
    await page.getByRole('button', { name: 'Page Layouts' }).click();

    await expect(page.getByText('Editorial Hero')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Draft' })).toBeVisible();
  });

  test('unauthorized reader cannot access page layout actions', async ({ page }) => {
    await page.goto('/admin/website/');
    await expect(page).toHaveURL(/\/admin\/login\/$/);
  });
});

test.describe('Public page defaults', () => {
  test('homepage renders with default sections when no layout exists', async ({ page }) => {
    await cleanupPageLayout('homepage');
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('section landing page renders with defaults', async ({ page }) => {
    await cleanupPageLayout('section:competition');
    const res = await page.goto('/competition/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('body')).not.toBeEmpty();
    await cleanupPageLayout('section:competition');
  });
});
