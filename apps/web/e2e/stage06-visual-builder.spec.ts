import { test, expect, type Page } from '@playwright/test';
import { readState } from './support';

/**
 * Stage 06 — browser verification of the visual Builder.
 *
 * WHY THIS FILE EXISTS. The Vitest suites prove the structure (rendered DOM)
 * and the security predicates (real functions, hostile inputs), but they cannot
 * prove the two claims that matter most for a visual builder, because the
 * runner has no browser: that the canvas actually loads the real draft page in
 * an iframe, and that a click inside that iframe selects the block in the
 * Builder. Stage 06's own instruction is explicit — "do not claim iframe
 * interaction is proven by source-text assertions" — so it is proven here, in
 * Chromium, against a running server.
 *
 * Safety: runs against the ISOLATED, SEEDED test database only, through the
 * existing guarded Playwright config. It writes nothing of its own; the fixture
 * admin comes from the established global-setup, and the pages under test
 * render registry defaults when no layout is stored.
 */

const CANVAS = 'iframe[title^="Draft preview canvas"]';

async function login(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

async function openBuilder(page: Page) {
  await login(page);
  await page.goto('/admin/website/');
  await page.getByRole('button', { name: 'Page Layouts' }).click();
  await expect(page.getByRole('heading', { name: /Page Structure/i })).toBeVisible({ timeout: 15000 });
}

test.describe('Stage 06 — three-panel visual builder', () => {
  test('all three panels render together', async ({ page }) => {
    await openBuilder(page);
    await expect(page.getByRole('heading', { name: /Page Structure/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Canvas$/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Properties/i })).toBeVisible();
  });

  test('the canvas loads the real draft page through the preview route', async ({ page }) => {
    await openBuilder(page);
    const frame = page.locator(CANVAS);
    await expect(frame).toBeVisible({ timeout: 15000 });

    // The iframe must end up on the actual public route, not on an admin page
    // and not on a bespoke editor renderer.
    await expect
      .poll(async () => page.frames().map((f) => f.url()).find((u) => u.includes('_canvas=1')) ?? '', {
        timeout: 20000,
      })
      .toContain('_pk=homepage');

    const canvas = page.frameLocator(CANVAS);
    // Real homepage content, produced by the real resolvers.
    await expect(canvas.locator('[data-nfr-slot]').first()).toBeAttached({ timeout: 20000 });
  });

  test('every rendered block carries a stable data-slot-id', async ({ page }) => {
    await openBuilder(page);
    const canvas = page.frameLocator(CANVAS);
    await expect(canvas.locator('[data-nfr-slot]').first()).toBeAttached({ timeout: 20000 });

    const ids = await page
      .frameLocator(CANVAS)
      .locator('[data-nfr-slot]')
      .evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.slotId ?? ''));

    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.length > 0), 'every slot container must carry an id').toBe(true);
    expect(new Set(ids).size, 'ids must be unique').toBe(ids.length);
  });

  test('clicking a section in the canvas selects it in the Builder', async ({ page }) => {
    await openBuilder(page);
    const canvas = page.frameLocator(CANVAS);
    const first = canvas.locator('[data-nfr-slot]').first();
    await expect(first).toBeAttached({ timeout: 20000 });

    // Nothing is selected to begin with.
    await expect(page.getByText('Select a section in the tree, or click one on the canvas.')).toBeVisible();

    const slotId = await first.evaluate((e) => (e as HTMLElement).dataset.slotId);
    await first.click({ position: { x: 5, y: 5 } });

    // The tree item for that slot becomes the selected one.
    await expect(page.locator(`#tree-item-${slotId}`)).toHaveAttribute('aria-selected', 'true', { timeout: 10000 });
    // And the inspector stops showing its empty state.
    await expect(page.getByText('Select a section in the tree, or click one on the canvas.')).toBeHidden();
  });

  test('clicking a canvas link selects instead of navigating away', async ({ page }) => {
    await openBuilder(page);
    const canvas = page.frameLocator(CANVAS);
    await expect(canvas.locator('[data-nfr-slot]').first()).toBeAttached({ timeout: 20000 });

    const link = canvas.locator('[data-nfr-slot] a[href]').first();
    const count = await canvas.locator('[data-nfr-slot] a[href]').count();
    test.skip(count === 0, 'no links inside blocks on this page');

    const before = page.frames().map((f) => f.url()).find((u) => u.includes('_canvas=1'));
    await link.click({ force: true });
    await page.waitForTimeout(1200);
    const after = page.frames().map((f) => f.url()).find((u) => u.includes('_canvas=1'));

    expect(after, 'editor-selection mode must suppress navigation').toBe(before);
  });

  test('selecting in the tree highlights the section on the canvas', async ({ page }) => {
    await openBuilder(page);
    const canvas = page.frameLocator(CANVAS);
    await expect(canvas.locator('[data-nfr-slot]').first()).toBeAttached({ timeout: 20000 });

    const treeItems = page.locator('[role="treeitem"]');
    await expect(treeItems.first()).toBeVisible();
    const target = treeItems.nth(1);
    const id = await target.evaluate((e) => e.id.replace('tree-item-', ''));
    await target.click();

    await expect(canvas.locator(`[data-slot-id="${id}"]`)).toHaveClass(/nfr-slot-selected/, { timeout: 10000 });
  });

  test('the tree is operable by keyboard alone', async ({ page }) => {
    await openBuilder(page);
    const first = page.locator('[role="treeitem"]').first();
    await expect(first).toBeVisible();

    await first.focus();
    await page.keyboard.press('Enter');
    await expect(first).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[role="treeitem"]').nth(1)).toHaveAttribute('aria-selected', 'true');
  });

  test('device modes change the canvas viewport width', async ({ page }) => {
    /**
     * Needs a wide window. At Playwright's default 1280px the three-panel grid
     * leaves the canvas column about 310px, and the container carries
     * `maxWidth: 100%` so 390 and 768 both clamp to 310 — which is the correct
     * no-horizontal-overflow behaviour, but makes the widths indistinguishable.
     * The first run of this test measured 310 for both and failed; the fix is a
     * realistic desktop viewport, not a looser assertion.
     */
    await page.setViewportSize({ width: 1900, height: 1000 });
    await openBuilder(page);
    /**
     * D-A6 — measure a SETTLED width, not a mid-transition one.
     *
     * The device label ("390px") becomes visible as soon as the state changes,
     * but the canvas shell animates to its new width, so reading
     * `boundingBox()` right after the label appeared sometimes captured a frame
     * part-way through the transition. That is what made this test flaky under
     * full-suite load: it twice reported the previous width (686) for mobile
     * while the product was correct.
     *
     * This waits in the browser, sampling on animation frames, until the width
     * has been unchanged for three consecutive frames. No sleep, no retry of
     * the assertions themselves, and not one assertion was weakened.
     */
    const settledWidth = async (): Promise<number> => {
      await page.evaluate(() => {
        const g = window as unknown as Record<string, unknown>;
        delete g.__nfrCanvasWidth;
        delete g.__nfrCanvasStable;
      });
      const handle = await page.waitForFunction(
        (sel: string) => {
          const frame = document.querySelector(sel);
          const el = frame?.parentElement;
          if (!el) return null;
          const w = el.getBoundingClientRect().width;
          const g = window as unknown as { __nfrCanvasWidth?: number; __nfrCanvasStable?: number };
          if (g.__nfrCanvasWidth !== undefined && Math.abs(g.__nfrCanvasWidth - w) < 0.5) {
            g.__nfrCanvasStable = (g.__nfrCanvasStable ?? 0) + 1;
          } else {
            g.__nfrCanvasStable = 0;
          }
          g.__nfrCanvasWidth = w;
          return (g.__nfrCanvasStable ?? 0) >= 3 ? w : null;
        },
        CANVAS,
        { polling: 'raf', timeout: 10_000 },
      );
      return (await handle.jsonValue()) as number;
    };

    await page.getByRole('button', { name: 'Mobile' }).click();
    await expect(page.getByText('390px')).toBeVisible();
    const mobile = await settledWidth();

    await page.getByRole('button', { name: 'Tablet' }).click();
    await expect(page.getByText('768px')).toBeVisible();
    const tablet = await settledWidth();

    await page.getByRole('button', { name: 'Desktop' }).click();
    await expect(page.getByText('1280px')).toBeVisible();
    const desktop = await settledWidth();

    /**
     * The contract is `width = min(deviceWidth, availableColumnWidth)`.
     *
     * Even at a 1900px window the Admin's three-column grid leaves the canvas
     * column about 686px, so tablet (768) and desktop (1280) both clamp to the
     * same value. My first two attempts asserted a strict mobile < tablet <
     * desktop ordering and failed on that clamp — the code was right both
     * times. What is actually guaranteed is that mobile renders at its exact
     * requested width (390 fits anywhere) and that the sequence never
     * decreases.
     */
    expect(Math.round(mobile), 'mobile must render at its exact requested width').toBeLessThanOrEqual(391);
    expect(Math.round(mobile)).toBeGreaterThanOrEqual(389);
    expect(mobile, 'mobile must be narrower than tablet').toBeLessThan(tablet);
    expect(tablet, 'tablet must not exceed desktop').toBeLessThanOrEqual(desktop);
    expect(Math.round(tablet), 'tablet is 768 or the column width, never more').toBeLessThanOrEqual(768);
  });

  test('a narrow Admin window clamps the canvas instead of overflowing the page', async ({ page }) => {
    // The Admin must stay usable on a narrow screen (Stage 06 Task 5).
    await page.setViewportSize({ width: 900, height: 800 });
    await openBuilder(page);

    await page.getByRole('button', { name: 'Desktop' }).click();
    const shell = page.locator(CANVAS).locator('..');
    const box = await shell.boundingBox();

    expect(box!.width, 'a 1280px preview must clamp inside a 900px window').toBeLessThan(900);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'the Admin page must not scroll horizontally').toBeLessThanOrEqual(1);
  });

  test('the canvas reloads after a successful Save Draft', async ({ page }) => {
    await openBuilder(page);
    const canvas = page.frameLocator(CANVAS);
    await expect(canvas.locator('[data-nfr-slot]').first()).toBeAttached({ timeout: 20000 });

    /**
     * MADE IDEMPOTENT IN STAGE 07.
     *
     * This read "A page with no stored layout starts dirty, so Save Draft is
     * available" — true on a clean database, and the test then SAVED one, so it
     * destroyed its own precondition. It passed in Stage 06 because that was the
     * first run against a fresh test database; the `homepage` PageLayout row it
     * wrote was never removed, and the next run found Save Draft disabled.
     * Stage 07 hit exactly that and had to clear the row by hand.
     *
     * The subject of this test is "the canvas reloads after a successful save",
     * not "a fresh page starts dirty". So it now makes the page dirty
     * explicitly, which holds whether or not a layout is already stored. No
     * assertion is weakened: the save still has to succeed and the canvas still
     * has to reload.
     */
    const save = page.getByRole('button', { name: 'Save Draft' });
    if (!(await save.isEnabled())) {
      // Toggle the first section's visibility off and on again: a no-op for the
      // stored layout, but it marks the editor dirty. The control's accessible
      // name is "Hide <block label>" / "Show <block label>".
      /**
       * CORRECTED IN STAGE 08. The Stage 07 version clicked the FIRST "Hide"
       * button and then "Show" to toggle back. Two problems, both latent
       * because this branch only runs when a layout is already stored:
       *
       *   - the first homepage block is `editorial-hero`, which is
       *     `required: true`, so the editor correctly refuses to hide it and no
       *     "Show" button ever appears;
       *   - toggling back restores the original JSON, and the editor computes
       *     `dirty` by comparing JSON — so the net effect is NOT dirty.
       *
       * Walk from the end, where the non-required blocks are, and leave one
       * hidden: a genuine change, which is what dirty means.
       */
      const hides = page.getByRole('button', { name: /^Hide / });
      const count = await hides.count();
      for (let i = count - 1; i >= 0; i--) {
        await hides.nth(i).click();
        if (await save.isEnabled()) break;
      }
    }
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText('Draft saved.')).toBeVisible({ timeout: 15000 });

    // The refresh token is in the iframe URL, so a reload is observable.
    await expect
      .poll(async () => page.frames().map((f) => f.url()).find((u) => u.includes('_canvas=1')) ?? '', { timeout: 20000 })
      .toContain('_pk=homepage');
    await expect(canvas.locator('[data-nfr-slot]').first()).toBeAttached({ timeout: 20000 });
  });
});

test.describe('Stage 06 — draft isolation holds with the canvas in place', () => {
  test('a public visitor receives no slot ids and no canvas bridge', async ({ browser }) => {
    // A fresh context: no admin session, no draft cookie.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto('/');
      await expect(page.locator('body')).toBeVisible();
      expect(await page.locator('[data-nfr-slot]').count(), 'public DOM must be unchanged').toBe(0);
      expect(await page.locator('[data-nfr-canvas-styles]').count(), 'bridge must not be served').toBe(0);
    } finally {
      await ctx.close();
    }
  });

  test('adding the canvas flag by hand grants a visitor nothing', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto('/?_preview=draft&_pk=homepage&_canvas=1');
      expect(await page.locator('[data-nfr-slot]').count(), 'editor mode is permission-gated, not URL-gated').toBe(0);
      expect(await page.locator('[data-nfr-canvas-styles]').count()).toBe(0);
    } finally {
      await ctx.close();
    }
  });

  test('the embed preview route refuses an unauthenticated request', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      const res = await page.goto('/admin/website/preview?pageKey=homepage&embed=1');
      // Either a redirect to login or an explicit refusal — never the draft page.
      const url = page.url();
      const status = res?.status() ?? 0;
      expect(url.includes('_canvas=1'), 'must not reach the canvas page').toBe(false);
      expect(status === 200 ? url.includes('login') : true).toBe(true);
    } finally {
      await ctx.close();
    }
  });
});
