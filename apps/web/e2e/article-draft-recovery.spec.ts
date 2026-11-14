import { test, expect, type Page } from '@playwright/test';
import { readState, testDb } from './support';

/**
 * Composer recovery — browser verification.
 *
 * The unit tests pin the store: one row per session, scoped to its owner,
 * faithful payload. What only a browser can show is the thing the feature
 * exists for — that work typed into the composer and then ABANDONED without
 * saving is still there afterwards, reachable from the Article Directory, and
 * comes back into the editor intact.
 *
 * "Abandoned" is simulated the way it actually happens: the page is navigated
 * away from without pressing Save. Nothing here saves an article until the
 * final step, which is also what proves the recovery copy is cleaned up.
 */

async function login(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

/** Removes every recovery row this spec could have made, by title. */
async function cleanup(titleFragment: string) {
  const db = testDb();
  try {
    await db.articleDraftSnapshot.deleteMany({ where: { title: { contains: titleFragment } } });
  } catch {
    console.warn('[e2e] could not clean recovery snapshots');
  } finally {
    await db.$disconnect();
  }
}

const marker = `Recovery Spec ${Date.now()}`;

test.afterAll(async () => { await cleanup('Recovery Spec'); });

test.describe('unsaved composer work is recoverable', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('autosaves a recovery copy and says when it was taken', async ({ page }) => {
    await page.goto('/admin/articles/new/');
    await page.locator('#field-01-headline').fill(`${marker} indicator`);

    // The indicator must say a COPY was kept, never "Saved" — the article
    // itself is still unsaved, and an author who read "Saved" and closed the
    // tab would be relying on something that has not happened.
    const state = page.getByTestId('editor-recovery-state');
    await expect(state).toBeVisible({ timeout: 20_000 });
    await expect(state).toContainText(/Recovery copy/i);
    // And the article is still unsaved.
    await expect(page.getByTestId('editor-dirty-badge')).toBeVisible();
  });

  test('ABANDONED work appears in the directory and comes back intact', async ({ page }) => {
    const title = `${marker} abandoned`;
    const body = 'A paragraph the author typed and then lost the tab on.';

    await page.goto('/admin/articles/new/');
    await page.locator('#field-01-headline').fill(title);
    await page.locator('#field-03-excerpt').fill('An excerpt that was also typed before the tab closed.');

    const surface = page.locator('#article-body-surface [contenteditable="true"]');
    await surface.click();
    await page.keyboard.type(body);

    await expect(page.getByTestId('editor-recovery-state')).toBeVisible({ timeout: 20_000 });

    // Leave WITHOUT saving — the failure this feature exists to prevent.
    await page.goto('/admin/articles/?status=unsaved');

    const row = page.getByTestId('recovery-row').filter({ hasText: title });
    await expect(row, 'abandoned work must be listed for recovery').toBeVisible();
    await expect(row).toContainText('NEVER SAVED');
    await expect(row, 'the list says how much work is at stake').toContainText(/\d+ words?/);

    await row.getByRole('link', { name: 'Resume' }).click();
    await page.waitForURL(/\/admin\/articles\/new\/\?recover=/);

    // Back in the composer, with the words.
    await expect(page.locator('#field-01-headline')).toHaveValue(title);
    await expect(page.locator('#article-body-surface [contenteditable="true"]')).toContainText(body);
    // Restored work is still UNSAVED, and must not look otherwise.
    await expect(page.getByTestId('editor-dirty-badge')).toBeVisible();
  });

  test('the tab carries a badge, so unsaved work is noticed without looking for it', async ({ page }) => {
    await page.goto('/admin/articles/new/');
    await page.locator('#field-01-headline').fill(`${marker} badge`);
    await expect(page.getByTestId('editor-recovery-state')).toBeVisible({ timeout: 20_000 });

    await page.goto('/admin/articles/');
    const tab = page.getByTestId('articles-tab-unsaved');
    await expect(tab).toBeVisible();
    await expect(tab).toContainText(/\d/);
  });

  test('SAVING the article removes its recovery copy', async ({ page }) => {
    const title = `${marker} saved`;
    await page.goto('/admin/articles/new/');
    await page.locator('#field-01-headline').fill(title);
    await page.locator('#field-03-excerpt').fill('An excerpt, so the save boundary accepts this draft.');

    /*
      An article type is required by the save boundary, and it lives in the
      Article Setup area — so the tab is opened first. That is itself part of
      what this checks: a save must send fields from areas that are not on
      screen.
    */
    await page.getByTestId('editor-area-tab-setup').click();
    for (const id of ['#editor-article-type', '#editor-primary-section', '#editor-author-byline']) {
      const field = page.locator(id);
      await expect(field, id).toBeVisible();
      await field.selectOption({ index: 1 });
    }

    await expect(page.getByTestId('editor-recovery-state')).toBeVisible({ timeout: 20_000 });

    const toast = page.locator('div.fixed.bottom-6.right-6');
    await page.getByRole('button', { name: /^(Save Draft|Create Draft)$/ }).click();
    // Read the outcome while the toast is still on screen: it hides itself
    // after 3.5 s, so a later read reports nothing and hides the real reason.
    await expect(toast).toBeVisible({ timeout: 20_000 });
    const said = (await toast.innerText()).trim();
    expect(said, `the save was refused: ${said}`).toContain('Saved to the database.');

    const dirty = page.getByTestId('editor-dirty-badge');
    await expect(dirty, 'a successful save clears the dirty state').toHaveCount(0, { timeout: 20_000 });

    await page.goto('/admin/articles/?status=unsaved');
    await expect(
      page.getByTestId('recovery-row').filter({ hasText: title }),
      'a saved article must not leave a copy offering an older version',
    ).toHaveCount(0);
  });

  test('a recovery draft can be discarded from the directory', async ({ page }) => {
    const title = `${marker} discard`;
    await page.goto('/admin/articles/new/');
    await page.locator('#field-01-headline').fill(title);
    await expect(page.getByTestId('editor-recovery-state')).toBeVisible({ timeout: 20_000 });

    await page.goto('/admin/articles/?status=unsaved');
    const row = page.getByTestId('recovery-row').filter({ hasText: title });
    await expect(row).toBeVisible();

    // This is the only copy of that work, so it is confirmed first.
    page.once('dialog', (d) => d.accept());
    await row.getByRole('button', { name: 'Discard' }).click();

    await expect(page.getByTestId('recovery-row').filter({ hasText: title })).toHaveCount(0);
  });
});
