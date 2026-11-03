import { test, expect, type Page } from '@playwright/test';
import { FIXTURE_SLUGS } from '../prisma/fixtures';
import { readState, testDb } from './support';

async function login(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

async function articleId(slug: string): Promise<string> {
  const db = testDb();
  try {
    return (await db.article.findFirstOrThrow({ where: { slug }, select: { id: true } })).id;
  } finally {
    await db.$disconnect();
  }
}

test.describe('admin smoke', () => {
  test('login page loads with labelled fields', async ({ page }) => {
    const res = await page.goto('/admin/login/');
    expect(res?.status()).toBe(200);
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('unauthenticated admin access is redirected to login', async ({ page }) => {
    await page.goto('/admin/articles/');
    await expect(page).toHaveURL(/\/admin\/login\/$/);
  });

  test('authorized admin reaches the editor; no Schedule control; source picker uses the DB directory', async ({ page }) => {
    await login(page);
    const id = await articleId(FIXTURE_SLUGS.publishedArticle);
    await page.goto(`/admin/articles/${id}/edit/`);
    await expect(page.getByRole('heading', { name: /Sources/ })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Schedule', exact: true })).toHaveCount(0);
    const scheduledOption = page.locator('select option[value="scheduled"]');
    await expect(scheduledOption).toHaveCount(0);
    await expect(page.getByText(/checks passed/)).toBeVisible();
    await expect(page.getByText(/% Score/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Attach from Directory' }).click();
    const directory = page.getByTestId('source-directory');
    await expect(directory.getByText('Fixture Source A')).toBeVisible();
    // Every listed entry is a real row of the Source table (the mock list no longer exists).
    const listed = await directory.locator(':scope > div .font-semibold').allTextContents();
    const db = testDb();
    const titles = new Set((await db.source.findMany({ select: { title: true } })).map((s) => s.title));
    await db.$disconnect();
    expect(listed.length).toBeGreaterThan(0);
    for (const t of listed) expect(titles.has(t), `"${t}" must exist in the Source table`).toBe(true);
  });

  test('legacy SCHEDULED article shows "Manual publish required" and keeps manual actions', async ({ page }) => {
    await login(page);
    const s = readState();
    await page.goto(`/admin/articles/${s.scheduledArticleId}/edit/`);
    await expect(page.getByTestId('manual-publish-required')).toBeVisible();
    await expect(page.getByText('will not publish automatically')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unschedule' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish Immediately' })).toBeVisible();

    await page.goto('/admin/articles/?status=scheduled');
    await expect(page.getByText('SCHEDULED — MANUAL PUBLISH REQUIRED').first()).toBeVisible();
  });

  test('notifications show an honest empty state (no fabricated messages)', async ({ page }) => {
    await login(page);
    await page.getByRole('button', { name: 'Open notifications' }).click();
    await expect(page.getByTestId('notifications-empty')).toBeVisible();
    for (const fake of ['SEO Audit Completed', 'XML Sitemap Generated', 'purse confirmation', 'Phase 0 Mock']) {
      await expect(page.getByText(fake)).toHaveCount(0);
    }
  });

  test('every sidebar module loads (no mock or dead admin routes exposed)', async ({ page }) => {
    await login(page);
    const hrefs = await page.locator('aside a[href^="/admin/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')!))]);
    expect(hrefs.length).toBeGreaterThanOrEqual(12);
    for (const href of hrefs) {
      const res = await page.goto(href);
      expect(res?.status(), href).toBe(200);
      await expect(page.getByText('Phase 0 Mock')).toHaveCount(0);
    }
  });
});
