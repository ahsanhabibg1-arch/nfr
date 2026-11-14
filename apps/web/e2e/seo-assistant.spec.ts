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

  test('the inspector column is not clipped — no panel is trapped behind an inner scrollbar', async ({ page }) => {
    /*
      WHAT THIS USED TO ASSERT, AND WHY IT CHANGED.

      It asserted that the inspector PINNED below the topbar while the page
      scrolled. That was a property of the old single-page editor, where the
      left column carried all eight fields and the body, making the grid row
      far taller than the inspector — the room `position: sticky` needs.

      The four editor areas removed that situation: in SEO & Media the left
      column holds four fields and the right holds the panels, so the row is
      only as tall as the inspector and there is nothing to stick within.
      Sticky was therefore removed rather than left inert, because with it
      inert the accompanying `max-h` + `overflow-y-auto` clipped the panels to
      viewport height inside a column that also scrolled with the page — two
      scrollbars, in the wrong order, hiding content.

      The property that MATTERS is the one that survived the change and is
      asserted here instead: nothing in the inspector is unreachable. Every
      panel is laid out in full, so scrolling the page reaches all of it.
    */
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsFixtureAdmin(page);
    await page.goto(await fixtureEditPath());
    await openEditorArea(page, 'seo');

    const panel = page.getByTestId('seo-assistant');
    await expect(panel).toBeVisible();

    const inspector = page.getByTestId('editor-inspector');
    const clipped = await inspector.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      overflowY: getComputedStyle(el).overflowY,
    }));
    // Laid out in full: no inner scroll area holding content out of reach.
    expect(clipped.scrollHeight, 'the inspector must not clip its own content')
      .toBeLessThanOrEqual(clipped.clientHeight + 1);
    expect(['visible', 'clip']).toContain(clipped.overflowY);

    // And the last panel in the column is reachable by scrolling the page.
    const last = page.getByTestId('editor-inspector').locator('> div').last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });
});
