import { test, expect } from '@playwright/test';
import { testDb } from './support';

/**
 * Batch 24 regression: the public account menu must reflect the real auth state
 * IMMEDIATELY — with no manual refresh — after registration, login and logout, and
 * must stay consistent across browser Back/Forward. The menu lives in the persistent
 * public layout, so it revalidates on navigation (and bfcache/focus) rather than only
 * on first mount. Desktop width exercises the dropdown variant.
 */
test.describe('public account menu auth-state sync', () => {
  test('menu updates after register / logout / login and across Back/Forward (no manual refresh)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const email = `e2e-menu-${Date.now()}@example.com`;
    const PW = 'correct horse battery staple';
    const db = testDb();
    try {
      // Logged out on the home page.
      await page.goto('/');
      await expect(page.getByTestId('account-signedout')).toBeVisible();

      // REGISTER → redirected to home; the menu must flip to signed-in with NO reload.
      await page.goto('/register/');
      await page.locator('#name').fill('E2E Menu');
      await page.locator('#email').fill(email);
      await page.locator('#password').fill(PW);
      await page.locator('#confirm').fill(PW);
      await page.locator('input[name="terms"]').check();
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/^http:\/\/localhost:3100\/$/);
      await expect(page.getByTestId('account-signedin')).toBeVisible();
      await expect(page.getByTestId('account-signedout')).toHaveCount(0);

      // LOGOUT from the home page (same-path redirect): menu flips to signed-out, NO reload.
      await page.getByTestId('account-avatar').click();
      const menu = page.getByTestId('account-signedin').getByRole('menu');
      await expect(menu).toBeVisible();
      await menu.getByRole('button', { name: 'Sign out' }).click();
      await page.waitForURL(/^http:\/\/localhost:3100\/$/);
      await expect(page.getByTestId('account-signedout')).toBeVisible();
      await expect(page.getByTestId('account-signedin')).toHaveCount(0);

      // LOGIN → home: signed-in again, immediately.
      await page.goto('/login/');
      await page.locator('#email').fill(email);
      await page.locator('#password').fill(PW);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/^http:\/\/localhost:3100\/$/);
      await expect(page.getByTestId('account-signedin')).toBeVisible();

      // BACK (to /login/) and FORWARD (to home): the menu stays consistent with the session.
      await page.goBack();
      await expect(page.getByTestId('account-signedin')).toBeVisible();
      await page.goForward();
      await expect(page.getByTestId('account-signedin')).toBeVisible();
    } finally {
      await db.user.deleteMany({ where: { email } }).catch(() => {});
      await db.$disconnect();
    }
  });
});
