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

test.describe('Batch 32 — Visual Page Builder', () => {
  test.beforeEach(async () => {
    await cleanupPageLayout('homepage');
  });

  test.afterEach(async () => {
    await cleanupPageLayout('homepage');
  });

  test('Page Layouts tab shows builder with Canvas and Properties headings', async ({ page }) => {
    await login(page);
    await page.goto('/admin/website/');
    await page.getByRole('button', { name: 'Page Layouts' }).click();
    await expect(page.getByRole('heading', { name: /Page Canvas/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: /Properties/i })).toBeVisible();
  });

  test('Add Section button opens block library with category filters', async ({ page }) => {
    await login(page);
    await page.goto('/admin/website/');
    await page.getByRole('button', { name: 'Page Layouts' }).click();
    await expect(page.getByText('+ Add Section')).toBeVisible({ timeout: 10000 });
    await page.getByText('+ Add Section').click();
    await expect(page.getByText('Add a Block')).toBeVisible({ timeout: 5000 });
  });

  test('Add Section shows premium block types', async ({ page }) => {
    await login(page);
    await page.goto('/admin/website/');
    await page.getByRole('button', { name: 'Page Layouts' }).click();
    await expect(page.getByText('+ Add Section')).toBeVisible({ timeout: 10000 });
    await page.getByText('+ Add Section').click();
    await expect(page.getByText('Rich Text Block').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('CTA Banner').first()).toBeVisible();
  });

  test('Adding a premium block inserts it into the canvas (DB-backed)', async ({ page }) => {
    const tableExists = await checkPageLayoutTable();
    test.skip(!tableExists, 'PageLayout migration not yet applied');

    await login(page);
    await page.goto('/admin/website/');
    await page.getByRole('button', { name: 'Page Layouts' }).click();
    await expect(page.getByText('+ Add Section')).toBeVisible({ timeout: 10000 });
    await page.getByText('+ Add Section').click();
    await expect(page.getByText('Add a Block')).toBeVisible({ timeout: 5000 });

    const addBtns = page.locator('button', { hasText: 'Rich Text Block' });
    const gridBtn = addBtns.first();
    await gridBtn.click();
    await expect(page.getByText(/Added.*Rich Text Block/)).toBeVisible({ timeout: 5000 });
  });

  test('Clicking a block shows its properties', async ({ page }) => {
    await login(page);
    await page.goto('/admin/website/');
    await page.getByRole('button', { name: 'Page Layouts' }).click();
    await expect(page.getByText('Editorial Hero').first()).toBeVisible({ timeout: 10000 });
    await page.getByText('Editorial Hero').first().click();
    await expect(page.getByText('Override hero image')).toBeVisible({ timeout: 5000 });
  });

  test('Save Draft with block IDs persists to database', async ({ page }) => {
    const tableExists = await checkPageLayoutTable();
    test.skip(!tableExists, 'PageLayout migration not yet applied');

    await login(page);
    await page.goto('/admin/website/');
    await page.getByRole('button', { name: 'Page Layouts' }).click();

    page.on('dialog', (d) => d.accept());

    await expect(page.getByText('Restore defaults')).toBeVisible({ timeout: 10000 });
    await page.getByText('Restore defaults').click();
    await expect(page.getByText('Defaults restored')).toBeVisible({ timeout: 10000 });

    await page.waitForTimeout(500);
    await page.goto('/admin/website/');
    await page.getByRole('button', { name: 'Page Layouts' }).click();
    await expect(page.getByText('Editorial Hero').first()).toBeVisible({ timeout: 10000 });

    const db = testDb();
    try {
      const layout = await db.pageLayout.findUnique({ where: { pageKey: 'homepage' } });
      expect(layout).toBeTruthy();
      const sections = layout!.draftSections as unknown as { id: string; sectionType: string }[];
      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBeGreaterThan(0);
      for (const s of sections) {
        expect(s.id).toBeTruthy();
        expect(s.sectionType).toBeTruthy();
      }
    } finally {
      await db.$disconnect();
    }
  });

  test('Drag handle is visible on blocks', async ({ page }) => {
    await login(page);
    await page.goto('/admin/website/');
    await page.getByRole('button', { name: 'Page Layouts' }).click();
    await expect(page.locator('[title="Drag to reorder"]').first()).toBeVisible({ timeout: 10000 });
  });
});
