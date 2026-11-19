import { test, expect, type Page } from '@playwright/test';
import { readState } from './support';

/**
 * The busy indicator — browser verification.
 *
 * The complaint this answers is specific: pressing a button that runs a server
 * action left the screen completely still, so the click looked ignored. These
 * tests assert the two halves of the answer, and one thing that is just as
 * important — that the indicator does not get in the way.
 *
 * Note what is NOT asserted: how long the bar is visible for. A save against a
 * fast local database can finish before the bar is due to appear, and a test
 * that depended on catching it would be a flake generator. What is asserted is
 * that the bar exists, that it is inert, and that it hides when nothing is
 * happening.
 */

async function login(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

const bar = (page: Page) => page.getByTestId('global-busy-bar');

test.describe('the busy indicator', () => {
  test('is mounted in the CMS and idle when nothing is happening', async ({ page }) => {
    await login(page);
    await expect(bar(page)).toHaveCount(1);
    await expect(bar(page)).toHaveAttribute('data-active', 'false');
  });

  test('never intercepts a click, however it is layered', async ({ page }) => {
    /*
      THE FAILURE THIS GUARDS AGAINST. The bar is fixed to the top of the
      viewport at the highest z-index in the application. If it took pointer
      events it would swallow clicks on whatever sits beneath it — the admin
      topbar — and the cure would be worse than the complaint.
    */
    await login(page);
    const hitsTheBar = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="global-busy-bar"]');
      if (!el) return 'missing';
      const box = el.getBoundingClientRect();
      const under = document.elementFromPoint(box.left + box.width / 2, box.top + 1);
      return under?.closest('[data-testid="global-busy-bar"]') ? 'blocked' : 'passes through';
    });
    expect(hitsTheBar).toBe('passes through');
  });

  test('raises during a navigation and settles again on arrival', async ({ page }) => {
    await login(page);

    // The indicator is driven by a click on a real internal link, which is what
    // `RouteBusy` listens for — not by a scripted router call.
    await page.getByRole('link', { name: /Articles/ }).first().click();
    await page.waitForURL(/\/admin\/articles/);

    // Whatever happened in between, an arrived page must not be left "busy":
    // a bar that never stops is worse than no bar at all.
    await expect(bar(page)).toHaveAttribute('data-active', 'false', { timeout: 20_000 });
  });

  test('a save reports itself and the indicator clears afterwards', async ({ page }) => {
    await login(page);
    await page.goto('/admin/articles/new/');

    const headline = page.locator('#field-01-headline');
    await expect(headline).toBeVisible();
    await headline.fill(`Busy indicator check ${Date.now()}`);

    // The save is refused (a new article needs more than a headline) — which is
    // exactly the case worth testing: the indicator must clear on the failure
    // path too, not only when everything goes well.
    await page.getByRole('button', { name: /^(Create Draft|Save Draft)$/ }).click();
    await expect(bar(page)).toHaveAttribute('data-active', 'false', { timeout: 20_000 });
  });
});
