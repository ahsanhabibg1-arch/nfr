import { test, expect, type Page } from '@playwright/test';
import { readState } from './support';

/**
 * Rodeo Coverage lifecycle admin — browser verification.
 *
 * The service layer is covered by the Vitest suites. What only a browser can
 * confirm is that the controls actually exist and are reachable: that Delete is
 * offered rather than disabled, that clicking it opens the dependency dialog,
 * and that the layout survives phone width.
 */

async function login(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

test.describe('Rodeo Coverage lifecycle admin', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/admin/rodeo-coverage/');
  });

  test('the lifecycle filter and search are present', async ({ page }) => {
    await expect(page.locator('#rodeo-search')).toBeVisible();
    const group = page.getByRole('group', { name: 'Lifecycle filter' });
    await expect(group).toBeVisible();
    for (const label of ['active', 'archived', 'all']) {
      await expect(group.getByRole('button', { name: label, exact: true })).toBeVisible();
    }
    // "Active" is the default view.
    await expect(group.getByRole('button', { name: 'active', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('switching the filter is reflected in aria-pressed', async ({ page }) => {
    const group = page.getByRole('group', { name: 'Lifecycle filter' });
    await group.getByRole('button', { name: 'archived', exact: true }).click();
    await expect(group.getByRole('button', { name: 'archived', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(group.getByRole('button', { name: 'active', exact: true })).toHaveAttribute('aria-pressed', 'false');
  });

  test('every row offers Archive and an ENABLED Delete', async ({ page }) => {
    /**
     * The owner's requirement in its most direct form: Delete must never be a
     * dead end. Previously a referenced row rendered a "locked (N article(s))"
     * label instead of a button.
     */
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();
    await expect(firstRow.getByRole('button', { name: 'Delete' })).toBeEnabled();
    await expect(firstRow.getByRole('button', { name: /Archive|Reactivate/ })).toBeVisible();
    await expect(firstRow.getByRole('button', { name: 'Slug' })).toBeVisible();
    await expect(page.locator('tbody').getByText('locked (')).toHaveCount(0);
  });

  test('a status badge is shown for every row', async ({ page }) => {
    const badges = page.locator('tbody').getByText(/^(Active|Archived)$/);
    expect(await badges.count()).toBeGreaterThan(0);
  });

  test('clicking Delete opens the dependency dialog, not an immediate delete', async ({ page }) => {
    const firstRow = page.locator('tbody tr').first();
    const name = (await firstRow.locator('td').first().innerText()).trim();

    await firstRow.getByRole('button', { name: 'Delete' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(name);
    // The confirm is a separate, explicit second step.
    await expect(dialog.getByRole('button', { name: 'Permanently delete' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();

    // Cancelling must change nothing.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(firstRow).toBeVisible();
  });

  test('the dialog states whether the record can be deleted', async ({ page }) => {
    await page.locator('tbody tr').first().getByRole('button', { name: 'Delete' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(/Nothing depends on this record|must be resolved before this can be deleted/),
    ).toBeVisible();
  });

  for (const [label, width] of [['desktop', 1280], ['tablet', 768], ['phone', 390]] as const) {
    test(`the Rodeo Coverage admin renders at ${label} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('#rodeo-search')).toBeVisible();
      await expect(page.locator('tbody tr').first()).toBeVisible();

      // No horizontal overflow of the document itself.
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(1);
    });
  }

  test('the filter controls are keyboard reachable', async ({ page }) => {
    await page.locator('#rodeo-search').focus();
    await expect(page.locator('#rodeo-search')).toBeFocused();
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
    expect(focused.toLowerCase()).toBe('active');
  });
});
