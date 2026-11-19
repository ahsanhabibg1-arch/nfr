import { test, expect, type Page } from '@playwright/test';
import { readState, testDb } from './support';

/**
 * Search engine verification — browser verification of the whole loop.
 *
 * THE ONE QUESTION THAT MATTERS. Not "did the form save", but "is the tag
 * actually being served on the public site" — and then, after a rotation, "has
 * the OLD token stopped being served". A verification feature that saves a
 * value without changing the public response is worse than none: Search Console
 * reports failure and the administrator has nothing to look at.
 *
 * So every assertion here is made against the real public HTTP response, not
 * against the admin screen's own claims.
 */

const SETTINGS = '/admin/settings/';

async function login(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

/**
 * The content of a meta tag in the live home page, or null.
 *
 * ONE REQUEST IS DISCARDED FIRST, and that is not superstition. The public
 * pages are rendered with ISR: after an invalidation the next request is
 * answered from the previous render while the new one is built in the
 * background (stale-while-revalidate). Reading once therefore measures the
 * render BEFORE the change roughly half the time, which is exactly the
 * intermittent failure this file showed — a different test each run, which is
 * the signature of a race rather than a defect.
 *
 * Discarding the first response and reading the second asks the question the
 * test actually means: what does the site serve once it has caught up.
 */
async function servedMeta(page: Page, name: string): Promise<string | null> {
  await page.request.get('/', { headers: { 'cache-control': 'no-cache' } }).catch(() => null);
  const res = await page.request.get('/', { headers: { 'cache-control': 'no-cache' } });
  const html = await res.text();
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const n = /\bname\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (n !== name.toLowerCase()) continue;
    return /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? null;
  }
  return null;
}

/**
 * How long a change may take to appear in the PUBLIC response.
 *
 * The public pages are rendered with ISR — the home page revalidates every 60
 * seconds — and a save additionally invalidates the tagged read, so in practice
 * the head changes at once. "In practice" is not "always": under
 * stale-while-revalidate the first request after an invalidation can still be
 * served the previous render while the new one is built, and with several of
 * these tests churning the same cache back to back, 20 seconds was sometimes
 * not enough. It failed on a different test each run, which is the signature of
 * a race rather than a defect.
 *
 * So the wait is set above the longest ISR window instead of being tuned until
 * it passed. A tag that has not appeared within this is a real failure.
 */
const PUBLIC_REFRESH = 90_000;

/*
 * THE TEST MUST BE ALLOWED TO WAIT AS LONG AS IT SAYS IT WILL.
 *
 * `PUBLIC_REFRESH` is 90 seconds, but Playwright's default budget for a whole
 * test is 30 — the `timeout: 120_000` in playwright.config.ts is how long the
 * SERVER gets to start, not the test. So a poll that was written to tolerate a
 * slow revalidation could never use more than a third of its window, and the
 * rotation test failed whenever the public page took longer than that under
 * the load of the full suite. It passed on its own, which is exactly how this
 * kind of mismatch hides.
 *
 * The budget here covers two full polling windows plus the ordinary page work
 * around them, so a failure now means the tag really did not appear.
 */
test.describe.configure({ timeout: PUBLIC_REFRESH * 2 + 60_000 });

async function openSearchEngineTab(page: Page) {
  await page.goto(SETTINGS);
  // `AdminTabs` renders plain buttons, not an ARIA tab set.
  await page.getByRole('button', { name: /Search Engines/i }).click();
  await expect(page.getByTestId('search-engine-panel')).toBeVisible();
}

/**
 * Leaves the panel holding exactly one Google record with `token`.
 *
 * Each test sets up its own state rather than inheriting the previous test's.
 * Chained tests were the first attempt and they were wrong twice over: running
 * one test alone failed for want of a record it never created, and a failure
 * early in the file cascaded into unrelated ones.
 */
async function withGoogleToken(page: Page, token: string) {
  await openSearchEngineTab(page);
  await clearAllRecords(page);
  await page.locator('#se-provider').selectOption('google');
  await page.locator('#se-value').fill(token);
  await page.getByTestId('se-save-verification').click();
  await expect(page.getByTestId('se-verification-row').filter({ hasText: 'google-site-verification' })).toBeVisible();
}

/** Removes every verification record currently listed. */
async function clearAllRecords(page: Page) {
  const rows = page.getByTestId('se-verification-row');
  for (let i = (await rows.count()) - 1; i >= 0; i -= 1) {
    page.once('dialog', (d) => d.accept());
    await rows.nth(i).getByRole('button', { name: 'Remove' }).click();
  }
  await expect(page.getByTestId('se-verification-row')).toHaveCount(0);
}

test.afterAll(async () => {
  const db = testDb();
  try {
    await db.systemSetting.deleteMany({
      where: { key: { in: ['search_verification', 'search_dns_verification', 'search_tracking'] } },
    });
  } catch {
    console.warn('[e2e] could not clear search engine settings');
  } finally {
    await db.$disconnect();
  }
});

test.describe('search engine verification, end to end', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('adding a Google token puts the tag in the PUBLIC response', async ({ page }) => {
    const token = `e2e-token-${Date.now()}`;
    await openSearchEngineTab(page);
    await clearAllRecords(page);

    await page.locator('#se-provider').selectOption('google');
    await page.locator('#se-value').fill(token);
    await page.getByTestId('se-save-verification').click();

    await expect(page.getByTestId('se-verification-row').filter({ hasText: 'google-site-verification' }))
      .toBeVisible();

    // THE ASSERTION THAT MATTERS: the live page carries it.
    await expect.poll(() => servedMeta(page, 'google-site-verification'), { timeout: PUBLIC_REFRESH }).toBe(token);
  });

  test('the Check button reports what is really served', async ({ page }) => {
    await withGoogleToken(page, `e2e-check-${Date.now()}`);
    const row = page.getByTestId('se-verification-row').filter({ hasText: 'google-site-verification' });
    await row.getByTestId('se-check').click();

    /*
      WHAT THIS CAN AND CANNOT ASSERT HERE.

      The check fetches the site at NEXT_PUBLIC_SITE_URL, which in this test
      environment is NOT the server Playwright runs — so "Serving" is not the
      expected answer and asserting it would mean weakening the check to make a
      test pass. What is asserted is the part that matters either way: the check
      reaches a definite, honest state rather than staying "Not checked", and it
      NAMES the URL it looked at, so an administrator can tell a missing tag
      from a check pointed at the wrong site.

      That the tag really is in the public response is proved by the first test
      in this file, against the server under test.
    */
    await expect(row).not.toContainText('Not checked', { timeout: 20_000 });
    await expect(row).toContainText(/Serving|Not seen yet|Could not check/i);
    await expect(row).toContainText(/https?:\/\//);
  });

  test('ROTATING the token replaces it, and the old one stops being served', async ({ page }) => {
    const older = `e2e-old-${Date.now()}`;
    await withGoogleToken(page, older);
    await expect.poll(() => servedMeta(page, 'google-site-verification'), { timeout: PUBLIC_REFRESH }).toBe(older);

    // A rotation replaces the value on the EXISTING record; a second active
    // tag of the same name is ambiguous and is refused by design.
    const next = `e2e-new-${Date.now()}`;
    const row = page.getByTestId('se-verification-row').filter({ hasText: 'google-site-verification' });
    await row.getByRole('button', { name: 'Disable' }).click();
    await page.locator('#se-provider').selectOption('google');
    await page.locator('#se-value').fill(next);
    await page.getByTestId('se-save-verification').click();

    await expect.poll(() => servedMeta(page, 'google-site-verification'), { timeout: PUBLIC_REFRESH }).toBe(next);
    expect(await servedMeta(page, 'google-site-verification'), 'the old token must be gone').not.toBe(older);
  });

  test('REMOVING the record removes the tag from the public response', async ({ page }) => {
    const token = `e2e-remove-${Date.now()}`;
    await withGoogleToken(page, token);
    await expect.poll(() => servedMeta(page, 'google-site-verification'), { timeout: PUBLIC_REFRESH }).toBe(token);

    await clearAllRecords(page);
    await expect.poll(() => servedMeta(page, 'google-site-verification'), { timeout: PUBLIC_REFRESH }).toBeNull();
  });

  test('a Bing token is served under its own tag name', async ({ page }) => {
    const token = `bing-${Date.now()}`;
    await openSearchEngineTab(page);
    await clearAllRecords(page);
    await page.locator('#se-provider').selectOption('bing');
    await page.locator('#se-value').fill(token);
    await page.getByTestId('se-save-verification').click();
    await expect.poll(() => servedMeta(page, 'msvalidate.01'), { timeout: PUBLIC_REFRESH }).toBe(token);

    // And clean up, so the next test starts from nothing.
    const row = page.getByTestId('se-verification-row').filter({ hasText: 'msvalidate.01' });
    page.once('dialog', (d) => d.accept());
    await row.getByRole('button', { name: 'Remove' }).click();
  });

  test('REFUSES a malicious token instead of putting it in the head', async ({ page }) => {
    await openSearchEngineTab(page);
    await clearAllRecords(page);
    await page.locator('#se-provider').selectOption('google');
    await page.locator('#se-value').fill('"><script>alert(1)</script>');
    await page.getByTestId('se-save-verification').click();

    // The screen says why, and nothing is created.
    await expect(page.getByRole('status')).toContainText(/token|verification/i, { timeout: 10_000 });
    await expect(page.getByTestId('se-verification-row')).toHaveCount(0);
    const html = await (await page.request.get('/')).text();
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  test('indexing diagnostics report the real robots.txt and sitemap', async ({ page }) => {
    await openSearchEngineTab(page);
    await page.getByTestId('se-run-health').click();
    const health = page.getByTestId('se-health');
    await expect(health).toBeVisible({ timeout: 20_000 });
    await expect(health).toContainText(/Does not block the site/i);
    await expect(health).toContainText(/Declares the sitemap/i);
    await expect(health).toContainText(/URLs/);
  });

  test('the change history records who did what', async ({ page }) => {
    await openSearchEngineTab(page);
    await page.getByTestId('se-load-audit').click();
    const table = page.getByTestId('se-audit-table');
    await expect(table).toBeVisible({ timeout: 20_000 });
    await expect(table).toContainText('search.verification');
  });
});

test.describe('access control', () => {
  test('an unauthenticated visitor cannot reach the settings screen', async ({ page }) => {
    await page.context().clearCookies();
    const res = await page.goto(SETTINGS);
    // Either redirected to the login screen, or refused outright.
    expect(page.url()).toMatch(/\/admin\/login\//);
    expect(res?.status()).toBeLessThan(400);
  });
});
