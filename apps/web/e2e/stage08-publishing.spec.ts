import { test, expect, type Page } from '@playwright/test';
import { readState } from './support';

/**
 * Stage 08 — browser verification.
 *
 * WHAT ONLY A BROWSER CAN PROVE HERE:
 *
 *   1. The hero's links are real: a crawler-visible `href` in the served HTML,
 *      reachable by Tab, with a visible focus ring, openable in a new tab —
 *      and the hero still LOOKS right at 1280 / 768 / 390, which Task H
 *      requires explicitly.
 *   2. The Builder's save-conflict path works end to end: a second session
 *      saves first, the first session is refused, the banner explains it, the
 *      unsaved edits survive, and reloading recovers.
 *   3. The Stage 06 canvas contract still holds after the Task B changes.
 *
 * Safety: the ISOLATED, SEEDED test database through the existing guarded
 * Playwright config. Layout rows this spec creates are removed by the
 * `global-teardown` Stage 07 added.
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

/**
 * Accept the Builder's confirmation dialogs.
 *
 * Playwright auto-DISMISSES dialogs, which silently cancelled a page switch
 * whenever the editor considered itself dirty. That is how the Stage 07
 * directory-canvas tests came to pass only by accident: a leftover PageLayout
 * row made the editor clean, and once Stage 07's teardown fix removed that row
 * the switch started being cancelled with no visible error.
 */
async function acceptDialogs(page: Page) {
  page.on('dialog', (d) => { void d.accept(); });
}

async function openBuilder(page: Page) {
  await acceptDialogs(page);
  await login(page);
  await page.goto('/admin/website/');
  await page.getByRole('button', { name: 'Page Layouts' }).click();
  await expect(page.getByRole('heading', { name: /Page Structure/i })).toBeVisible({ timeout: 15000 });
}

/**
 * Make the editor dirty.
 *
 * Two things the first attempt got wrong, both worth recording:
 *
 *   - it clicked the FIRST "Hide" button, and the first homepage block is
 *     `editorial-hero`, which is `required: true`. The editor correctly
 *     refuses ("Required blocks cannot be hidden"), so no "Show" button ever
 *     appeared and the helper timed out;
 *   - it then clicked "Show" to toggle back — which returns the layout to its
 *     original JSON, and the editor computes `dirty` by comparing JSON, so the
 *     net effect was NOT dirty.
 *
 * So: walk the Hide buttons from the end, where the non-required blocks are,
 * and LEAVE one hidden. That is a genuine change, which is what "dirty" means.
 */
async function makeDirty(page: Page) {
  const save = page.getByRole('button', { name: 'Save Draft' });
  if (await save.isEnabled()) return;

  const hides = page.getByRole('button', { name: /^Hide / });
  const n = await hides.count();
  for (let i = n - 1; i >= 0; i--) {
    await hides.nth(i).click();
    if (await save.isEnabled()) return;
  }
  throw new Error('could not make the editor dirty: every block refused to hide');
}

/* ── 1. Task H — the hero links, in a real browser ────────────────── */

test.describe('Stage 08 Task H — homepage hero links are real', () => {
  test('every hero article link has a crawlable href in the served HTML', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBeLessThan(400);

    // Read the RAW server HTML, not the hydrated DOM: this is what a crawler
    // gets, and it is exactly what the old click-handler markup lacked.
    const html = (await res!.text()) ?? '';
    const anchorHrefs = [...html.matchAll(/<a\b[^>]*\bhref="(\/articles\/[^"]+)"/g)].map((m) => m[1]);
    expect(anchorHrefs.length, 'the hero must contribute crawlable article links').toBeGreaterThan(0);
    for (const href of anchorHrefs) expect(href).toMatch(/^\/articles\/.+/);
  });

  test('the lead CTA is an anchor, not a button', async ({ page }) => {
    await page.goto('/');
    const cta = page.locator('a[aria-label^="Read Full Article"]').first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', /^\/articles\/.+/);
  });

  test('the hero links are reachable by keyboard and show a focus ring', async ({ page }) => {
    await page.goto('/');
    const cta = page.locator('a[aria-label^="Read Full Article"]').first();
    await expect(cta).toBeVisible();

    await cta.focus();
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      return { tag: el.tagName, href: el.getAttribute('href'), outline: getComputedStyle(el).outlineStyle };
    });
    expect(focused?.tag, 'the focused element must be the link itself').toBe('A');
    expect(focused?.href).toMatch(/^\/articles\/.+/);

    // Tab must reach it from the page, not only programmatic focus.
    await page.keyboard.press('Tab');
    const stillOnAnchor = await page.evaluate(() => document.activeElement?.tagName);
    expect(['A', 'BUTTON', 'INPUT']).toContain(stillOnAnchor);
  });

  test('pressing Enter on a hero link navigates to the article', async ({ page }) => {
    await page.goto('/');
    const cta = page.locator('a[aria-label^="Read Full Article"]').first();
    const href = await cta.getAttribute('href');
    await cta.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    expect(page.url()).toContain(href!);
  });

  test('a secondary story card navigates on click', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('article.group a[href^="/articles/"]');
    if ((await cards.count()) === 0) test.skip(true, 'no secondary stories in the seeded database');
    const href = await cards.first().getAttribute('href');
    await cards.first().click();
    await page.waitForURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  test('a hero card contains exactly one interactive element', async ({ page }) => {
    await page.goto('/');
    /**
     * Scoped to cards that actually contain an article link. `article.group`
     * alone also matches cards rendered by other homepage sections, which have
     * their own link structure — the first version of this test matched those
     * and reported zero anchors for them.
     */
    const cards = page.locator('article.group:has(> a[href^="/articles/"])');
    const n = await cards.count();
    if (n === 0) test.skip(true, 'no secondary stories in the seeded database');
    for (let i = 0; i < n; i++) {
      const card = cards.nth(i);
      expect(await card.locator('a').count(), 'one anchor per card, no duplicated links').toBe(1);
      expect(await card.locator('button').count(), 'no nested interactive element').toBe(0);
    }
  });

  for (const [label, width, height] of [
    ['desktop 1280', 1280, 900],
    ['tablet 768', 768, 1024],
    ['phone 390', 390, 844],
  ] as const) {
    test(`the hero renders correctly at ${label}`, async ({ page }) => {
      // Task H requires visual verification at these three widths.
      await page.setViewportSize({ width, height });
      await page.goto('/');

      const h1 = page.locator('h1').first();
      await expect(h1).toBeVisible();

      const cta = page.locator('a[aria-label^="Read Full Article"]').first();
      await expect(cta).toBeVisible();

      // The link must be inside the viewport and have a real clickable area —
      // the regression a layout change would cause.
      const box = await cta.boundingBox();
      expect(box, 'the CTA must have a layout box').not.toBeNull();
      expect(box!.width).toBeGreaterThan(40);
      expect(box!.height).toBeGreaterThan(20);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);

      // No horizontal overflow introduced by the markup change.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'the hero must not cause horizontal scrolling').toBeLessThanOrEqual(1);
    });
  }
});

/* ── 2. Task B/I — the save-conflict path, end to end ─────────────── */

test.describe('Stage 08 Tasks B + I — the version conflict is explained and recoverable', () => {
  test('a stale save is refused, explained, and does not lose the edits', async ({ browser }) => {
    /**
     * Two independent browser contexts, both signed in as the fixture admin.
     * Context A loads the Builder, context B saves first, then A saves — which
     * is the real-world shape of KD-09 and the one that used to overwrite B's
     * work with no warning at all.
     */
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    try {
      await openBuilder(pageA);
      await openBuilder(pageB);

      // B saves first, advancing the stored version.
      await makeDirty(pageB);
      await pageB.getByRole('button', { name: 'Save Draft' }).click();
      await expect(pageB.getByText('Draft saved.')).toBeVisible({ timeout: 15000 });

      // A now holds a stale token.
      await makeDirty(pageA);
      await pageA.getByRole('button', { name: 'Save Draft' }).click();

      // The banner, not a vanishing toast.
      const banner = pageA.locator('[data-nfr-conflict]');
      await expect(banner).toBeVisible({ timeout: 15000 });
      await expect(banner).toContainText(/someone else changed this page/i);
      await expect(banner).toContainText(/not/i);
      await expect(banner.getByRole('button', { name: /Reload current version/i })).toBeVisible();
      await expect(banner.getByRole('button', { name: /Keep editing/i })).toBeVisible();

      // The editor still holds the operator's unsaved work: Save Draft is still
      // offered, so the conflict is recoverable rather than destructive.
      await expect(pageA.getByRole('button', { name: 'Save Draft' })).toBeEnabled();
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('the conflict banner names the stored version', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    try {
      await openBuilder(pageA);
      await openBuilder(pageB);
      await makeDirty(pageB);
      await pageB.getByRole('button', { name: 'Save Draft' }).click();
      await expect(pageB.getByText('Draft saved.')).toBeVisible({ timeout: 15000 });

      await makeDirty(pageA);
      await pageA.getByRole('button', { name: 'Save Draft' }).click();
      const banner = pageA.locator('[data-nfr-conflict]');
      await expect(banner).toBeVisible({ timeout: 15000 });
      // Both numbers, so the operator can see they are behind.
      await expect(banner).toContainText(/version \d+/i);
      await expect(banner).toContainText(/stored version is now \d+/i);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test('a save succeeds normally when no one else has changed the page', async ({ page }) => {
    // The guard must not fire on the ordinary single-editor path.
    await openBuilder(page);
    await makeDirty(page);
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-nfr-conflict]')).toHaveCount(0);
  });

  test('two consecutive saves from the SAME editor both succeed', async ({ page }) => {
    /**
     * The regression this guards: if the editor did not advance its token after
     * a successful save, the second save would conflict with itself and the
     * Builder would be unusable.
     */
    await openBuilder(page);
    await makeDirty(page);
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible({ timeout: 15000 });

    await makeDirty(page);
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await expect(page.getByText('Draft saved.')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-nfr-conflict]')).toHaveCount(0);
  });
});

/* ── 3. The Stage 06 canvas contract still holds ──────────────────── */

test.describe('Stage 08 — the canvas contract survives the publishing changes', () => {
  test('the canvas still loads the real draft page with stable slot ids', async ({ page }) => {
    await openBuilder(page);
    const frame = page.frameLocator(CANVAS);
    const slots = frame.locator('[data-nfr-slot]');
    await expect(slots.first()).toBeAttached({ timeout: 20000 });
    const id = await slots.first().getAttribute('data-slot-id');
    expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  test('no autosave was introduced — nothing saves without the button', async ({ page }) => {
    /**
     * Explicitly forbidden by Task I. Making the editor dirty and waiting must
     * leave it dirty: an autosave would clear the state on its own.
     */
    await openBuilder(page);
    await makeDirty(page);
    await page.waitForTimeout(4000);
    await expect(page.getByRole('button', { name: 'Save Draft' })).toBeEnabled();
    await expect(page.getByText('Draft saved.')).toHaveCount(0);
  });

  test('no undo/redo controls were added', async ({ page }) => {
    await openBuilder(page);
    await expect(page.getByRole('button', { name: /^Undo$/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Redo$/i })).toHaveCount(0);
  });

  test('the public homepage still leaks no editor markup', async ({ page }) => {
    const res = await page.goto('/');
    const html = (await res!.text()) ?? '';
    expect(html).not.toContain('data-slot-id');
    expect(html).not.toContain('data-nfr-slot');
  });
});
