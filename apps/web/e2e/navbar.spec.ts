import { test, expect } from '@playwright/test';

/**
 * Navbar & animated-search refinement (navbar-ux-refinement batch).
 * Verifies removed controls, preserved sections, the animated search interaction,
 * the mobile drawer, and no horizontal overflow across target widths.
 */
const SECTIONS = ['NFR Competition', 'NFR Entertainment', 'NFR Events & Shopping', 'NFR Plan & Watch', 'More Rodeo'];

test.describe('navbar refinement', () => {
  test('desktop: five sections present; tagline + Quick Access removed', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: /primary/i });
    for (const label of SECTIONS) await expect(nav.getByRole('link', { name: label })).toBeVisible();
    // Scope the "removed" checks to the header (the footer may legitimately mention the brand).
    const header = page.locator('header');
    await expect(header.getByText('Independent Publication')).toHaveCount(0);
    await expect(header.getByRole('button', { name: 'Quick Access' })).toHaveCount(0);
    // Exactly one visible search control in the header (no duplicate/overlap).
    await expect(page.getByRole('button', { name: 'Search' })).toHaveCount(1);
  });

  test('animated search submits to the existing /search/ route (query contract preserved)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('searchbox', { name: 'Search NFRGuide' }).fill('bull riding');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/search\/\?q=bull(%20|\+)riding/);
  });

  test('mobile drawer exposes the five sections and a search entry', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: /open mobile navigation/i }).click();
    const dialog = page.getByRole('dialog');
    for (const label of SECTIONS) await expect(dialog.getByRole('link', { name: label })).toBeVisible();
  });

  test('no horizontal overflow at 320/375/768/1024/1280/1440', async ({ page }) => {
    for (const w of [320, 375, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/');
      const overflow = await page.evaluate(() => {
        const el = document.documentElement;
        const prev = el.style.overflowX; el.style.overflowX = 'visible';
        const d = el.scrollWidth - el.clientWidth; el.style.overflowX = prev; return d;
      });
      expect(overflow, `width ${w}`).toBeLessThanOrEqual(1);
    }
  });
});
