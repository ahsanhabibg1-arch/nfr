import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { FIXTURE_SLUGS } from '../prisma/fixtures';
import { E2E_DIR, readState, testDb, openEditorArea } from './support';

/**
 * Batch 25 — Article Editor SEO Assistant. Verifies the detailed, actionable SEO panel:
 * grouped findings with counts + readiness summary, the Check-SEO action (which must NOT
 * save/publish/navigate), and Go-to-Field navigation. Server-side publication enforcement
 * is covered separately by the article/workflow suites and is not bypassed here.
 */
async function loginAsFixtureAdmin(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

async function fixtureEditPath(): Promise<string> {
  const db = testDb();
  try {
    const id = (await db.article.findFirstOrThrow({ where: { slug: FIXTURE_SLUGS.publishedArticle }, select: { id: true } })).id;
    return `/admin/articles/${id}/edit/`;
  } finally {
    await db.$disconnect();
  }
}

test.describe('article editor SEO Assistant', () => {
  test('renders grouped findings, counts, readiness; Check SEO does not save/navigate; Go-to-Field focuses the field', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginAsFixtureAdmin(page);
    const editPath = await fixtureEditPath();
    await page.goto(editPath);

    // The SEO Assistant lives on the SEO tab since the editor became a tab set.
    await openEditorArea(page, 'seo');
    const panel = page.getByTestId('seo-assistant');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('seo-counts')).toBeVisible();
    await expect(page.getByTestId('seo-readiness')).toContainText(/passed|blocked/i);

    // Screenshot for the batch-25 docs (Phase I).
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(E2E_DIR, '..', '..', '..', 'docs', 'batches', 'batch-25', 'seo-assistant-panel.png'), fullPage: false });

    // Check SEO must NOT save or navigate — it only re-surfaces the live results.
    await page.getByTestId('seo-check-button').click();
    await expect(page).toHaveURL(new RegExp(editPath.replace(/\//g, '\\/') + '$'));
    await expect(page.getByTestId('seo-readiness')).toBeVisible();

    // Go-to-Field: open every category, expand the SEO Title check, click its field link,
    // and assert focus lands on the SEO Title input (Field 05).
    await page.evaluate(() => {
      document.querySelectorAll('[data-testid="seo-assistant"] details').forEach((d) => ((d as HTMLDetailsElement).open = true));
    });
    const row = panel.locator('li', { hasText: 'SEO Title length' }).first();
    await row.locator('button[aria-expanded]').first().click();
    await row.getByRole('button', { name: /go to field/i }).click();
    await expect(page.locator('#field-05-seotitle')).toBeFocused();
  });

  test('the inspector column scrolls independently (stays in view while the page scrolls)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsFixtureAdmin(page);
    await page.goto(await fixtureEditPath());
    // The SEO Assistant lives on the SEO tab since the editor became a tab set.
    await openEditorArea(page, 'seo');
    const panel = page.getByTestId('seo-assistant');
    await expect(panel).toBeVisible();
    const inspector = page.getByTestId('editor-inspector');
    // Scroll DOWN through the editorial content (as when writing). The sticky inspector must
    // PIN near the top of the viewport (top ≈ 80px) instead of scrolling away with the page.
    // (Without the fix — <body> overflow-x:hidden made body a scroll container — the column
    // scrolled off to a negative top.)
    await page.evaluate(() => window.scrollTo(0, 450));
    await page.waitForTimeout(300);
    await expect(inspector).toBeInViewport();
    const topAfter = await inspector.evaluate((el) => el.getBoundingClientRect().top);
    expect(topAfter).toBeGreaterThanOrEqual(60);
    expect(topAfter).toBeLessThanOrEqual(110); // pinned at the sticky offset, not scrolled away
  });
});
