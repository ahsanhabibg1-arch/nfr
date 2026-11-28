import { expect, test } from '@playwright/test';
import { readState, testDb } from './support';

test('category media picker keeps a scrollable thumbnail grid on desktop and mobile', async ({ page }) => {
  const { runId, adminEmail, adminPassword } = readState();
  const prefix = `picker-${runId}-`;
  const db = testDb();

  try {
    await db.mediaAsset.createMany({
      data: Array.from({ length: 18 }, (_, index) => ({
        filename: `${prefix}${index}.jpg`,
        storageKey: `${prefix}${index}`,
        url: '/assets/images/hero_bull_riding_1793166440262.jpg',
        altText: `Test media ${index}`,
      })),
    });

    await page.goto('/admin/login/');
    await page.locator('#email').fill(adminEmail);
    await page.locator('#password').fill(adminPassword);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/admin\/$/);
    await page.goto('/admin/editorial-organization/');
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    await page.getByRole('button', { name: /choose from media library|change image/i }).click();

    const picker = page.getByRole('dialog', { name: /select featured editorial media/i });
    await expect(page.getByRole('dialog')).toHaveCount(1);
    const tiles = picker.locator(`button[title^="${prefix}"]`);
    await expect(tiles).toHaveCount(18);

    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      const grid = await tiles.first().evaluate((tile) => {
        const list = tile.parentElement!;
        return {
          height: tile.querySelector('img')!.getBoundingClientRect().height,
          scrollable: list.scrollHeight > list.clientHeight,
          fitsWidth: list.scrollWidth <= list.clientWidth,
        };
      });
      expect(grid.height).toBeGreaterThanOrEqual(100);
      expect(grid.scrollable).toBe(true);
      expect(grid.fitsWidth).toBe(true);
      const tile = tiles.nth(width === 1280 ? 17 : 16);
      await tile.click();
      await expect(tile).toHaveAttribute('aria-pressed', 'true');
    }

    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Edit Category' })).toBeVisible();
  } finally {
    await db.mediaAsset.deleteMany({ where: { storageKey: { startsWith: prefix } } });
    await db.$disconnect();
  }
});
