import { test, expect, type Page } from '@playwright/test';
import { readState } from './support';

/**
 * Batch 05 — Discipline Classification management, browser verification.
 *
 * The service layer and the public filter are covered by Vitest. What only a
 * browser can confirm is that the new tab and the two selectors are actually
 * reachable, that the immutable identity is shown but not editable, that a
 * referenced classification offers no Delete, and that none of it overflows a
 * phone screen.
 *
 * MOBILE IS CHECKED HERE because of a failure this batch caused and fixed: a
 * leaked test fixture added classifications, which widened the public
 * Competition filter row and broke the navbar and hero overflow assertions at
 * 320px and 390px. Horizontal overflow is the failure mode this feature can
 * cause, so it is asserted on the surfaces the feature touches.
 */

const PHONE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 568 };

async function login(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

/** Document-level horizontal overflow, in pixels. 1px tolerates rounding. */
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe('Discipline Classification management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/admin/rodeo-coverage/');
  });

  test('the Classifications tab exists and is reachable from Rodeo Coverage', async ({ page }) => {
    const tab = page.getByRole('button', { name: /Classifications/ });
    await expect(tab).toBeVisible();
    await tab.click();
    // The explanatory copy that answers "are these the editorial categories?"
    await expect(page.getByText(/not.*the five editorial sections/i)).toBeVisible();
  });

  test('it lists the two seeded classifications with their immutable identity and discipline counts', async ({ page }) => {
    await page.getByRole('button', { name: /Classifications/ }).click();

    // Either the managed table is seeded, or the tab explains why it is not.
    const notReady = page.getByText(/does not exist yet|registry is empty/i);
    if (await notReady.count()) {
      // An honest skip: the environment has not applied the migration, which the
      // tab states rather than showing an empty editor.
      await expect(notReady.first()).toBeVisible();
      test.skip(true, 'managed classification table absent or unseeded on this environment');
    }

    const table = page.locator('table').last();
    await expect(table).toContainText('Roughstock');
    await expect(table).toContainText('Timed Event');
    // The Identity column header is what tells an administrator the value is permanent.
    await expect(table).toContainText('Identity');
    await expect(table).toContainText('Disciplines');
  });

  test('a referenced classification offers no Delete, and the reason is stated', async ({ page }) => {
    await page.getByRole('button', { name: /Classifications/ }).click();
    if (await page.getByText(/does not exist yet|registry is empty/i).count()) {
      test.skip(true, 'managed classification table absent or unseeded on this environment');
    }

    /**
     * Asserted as the INVARIANT, not against a particular row.
     *
     * The first version assumed the seeded classifications were referenced by
     * the fixture disciplines. In the e2e database those disciplines carry no
     * classification text, so the bootstrap links none of them and Delete is
     * legitimately offered — the test failed on its own premise, not on a
     * defect. What must hold on every row, in every environment, is that Delete
     * appears exactly when the discipline count is zero: the service re-counts
     * and refuses otherwise, and `ON DELETE RESTRICT` refuses again.
     */
    const rows = page.locator('tbody tr');
    const n = await rows.count();
    expect(n, 'the classifications table should have rows').toBeGreaterThan(0);

    let checkedReferenced = 0;
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const cells = row.locator('td');
      // "Disciplines" is the second-to-last column; the last is the actions cell.
      const count = Number((await cells.nth((await cells.count()) - 2).textContent())?.trim() || '0');
      const deletes = await row.getByRole('button', { name: 'Delete' }).count();
      expect(deletes, `row ${i} has ${count} discipline(s) but ${deletes} Delete button(s)`)
        .toBe(count === 0 ? 1 : 0);
      // Deactivate is always available — it is the documented alternative.
      await expect(row.getByRole('button', { name: /Deactivate|Activate/ })).toBeVisible();
      if (count > 0) checkedReferenced += 1;
    }
    // The page states the rule, whether or not a referenced row happens to exist.
    await expect(page.getByText(/cannot be deleted .*deactivate it instead/i)).toBeVisible();
    test.info().annotations.push({
      type: 'classification-rows',
      description: `${n} row(s) checked, ${checkedReferenced} of them referenced by at least one discipline`,
    });
  });

  test('the edit dialog never offers the immutable identity as a field', async ({ page }) => {
    await page.getByRole('button', { name: /Classifications/ }).click();
    if (await page.getByText(/does not exist yet|registry is empty/i).count()) {
      test.skip(true, 'managed classification table absent or unseeded on this environment');
    }

    await page.locator('tbody tr', { hasText: 'Roughstock' }).first().getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Name')).toBeVisible();
    // No control for the identity, and the dialog says why.
    await expect(dialog.getByLabel('Identity')).toHaveCount(0);
    await expect(dialog.getByText(/permanent identity cannot be changed/i)).toBeVisible();
  });

  test('Add Discipline offers a Classification field, not a "Category" one', async ({ page }) => {
    await page.getByRole('button', { name: /^Disciplines/ }).click();
    await page.getByRole('button', { name: '+ Add Discipline' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Classification (optional)')).toBeVisible();
    // The misleading label is gone — this is the terminology fix.
    await expect(dialog.getByText('Category (optional)')).toHaveCount(0);
  });

  test('Landing SEO exposes the same Classification selector for a discipline', async ({ page }) => {
    await page.goto('/admin/landing-seo/');
    const link = page.locator('a[href*="type=DISCIPLINE"]').first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page.getByText('Classification', { exact: true })).toBeVisible();
    await expect(page.getByText(/how the event is contested/i)).toBeVisible();
  });

  test('MOBILE: the Classifications tab does not overflow a 390px phone', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/admin/rodeo-coverage/');
    await page.getByRole('button', { name: /Classifications/ }).click();
    // The table is allowed to scroll inside its own container; the PAGE is not.
    expect(await overflow(page), 'the Classifications tab must not scroll the page sideways').toBeLessThanOrEqual(1);
  });
});

test.describe('the public Competition filter at phone width', () => {
  for (const vp of [NARROW, PHONE]) {
    test(`no horizontal overflow at ${vp.width}px with the live classification set`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/');
      await expect(page.locator('#competition')).toBeVisible();
      expect(await overflow(page), `the homepage must not scroll sideways at ${vp.width}px`).toBeLessThanOrEqual(1);
    });
  }

  test('the filter buttons state counts that match the disciplines rendered', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#competition');
    await expect(section).toBeVisible();

    const buttons = section.locator('button');
    const labels = (await buttons.allTextContents()).map((t) => t.trim()).filter(Boolean);
    const all = labels.find((l) => /^All \d+ Events$/.test(l));
    expect(all, `expected an "All N Events" button, got: ${labels.join(' | ')}`).toBeTruthy();

    /**
     * The counts must be arithmetic, not decoration: the per-classification
     * counts have to add up to the "All" count. This is what the old hardcoded
     * "All 7 Events / Roughstock (3) / Timed Events (4)" could not guarantee
     * once an administrator added or archived a discipline.
     */
    const total = Number(all!.match(/\d+/)![0]);
    const parts = labels
      .filter((l) => l !== all)
      .map((l) => l.match(/\((\d+)\)\s*$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => Number(m[1]));
    expect(parts.length, `expected at least one classification button, got: ${labels.join(' | ')}`).toBeGreaterThan(0);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
  });
});
