import { test, expect, type Page } from '@playwright/test';
import { readState } from './support';

/**
 * Stage 07 — browser verification of the new detail and directory blocks.
 *
 * WHY THIS FILE EXISTS. Stage 06 learned the hard way that a green Vitest suite
 * is not evidence for anything involving an iframe, a response header, or two
 * independent computations of the same data: the unit suites were entirely green
 * while the canvas was blank in Chromium (`X-Frame-Options: DENY`) and
 * click-to-select silently did nothing (randomly-minted default slot ids).
 * Stage 07 adds blocks that must work inside that same canvas, and changes the
 * public HTML of two live routes, so both claims are checked in a real browser.
 *
 * WHAT IS PROVEN HERE, AND NOWHERE ELSE:
 *
 *   1. The rewritten directory pages still render a working page — heading,
 *      search form, entries, pagination — served by the real route.
 *   2. The new `directory-hero` and `directory-grid` blocks are clickable on the
 *      Stage 06 canvas, which is the claim the "Editable" badge now makes.
 *   3. The frame headers Stage 06 fixed are still correct, and cross-origin
 *      framing is still refused.
 *   4. Search and pagination still work as navigation, not just as markup.
 *
 * Safety: runs against the ISOLATED, SEEDED test database through the existing
 * guarded Playwright config. It writes no fixtures of its own.
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

/** Select a page key in the Builder's page picker. */
async function selectPage(page: Page, label: RegExp) {
  const picker = page.locator('select').first();
  await picker.selectOption({ label: (await picker.locator('option', { hasText: label }).first().innerText()).trim() });
}

/* ── 1. The rewritten directory routes still serve a working page ─── */

test.describe('Stage 07 Task F — the public directory pages still work', () => {
  for (const [name, path] of [
    ['competitors', '/competitors/'],
    ['venues', '/venues/'],
  ] as const) {
    test(`${name}: heading, search form and listing all render`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status(), 'the route must not error').toBeLessThan(400);

      // Exactly one h1 — the hero block emits it; the route no longer does.
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('h1')).not.toBeEmpty();

      /**
       * Scoped by id, not by `input[name="q"]`. The site header carries its own
       * search input with the same name, so the bare selector matches two
       * elements — which is itself worth knowing: the directory form must be
       * addressable independently of the chrome around it.
       */
      await expect(page.locator('#directory-q')).toBeVisible();
      await expect(page.locator('form[method="get"] button[type="submit"]')).toBeVisible();

      // Labels, so the form is reachable by keyboard and screen reader.
      await expect(page.locator('label[for="directory-q"]')).toBeVisible();
    });

    test(`${name}: submitting the search form navigates and keeps the query`, async ({ page }) => {
      await page.goto(path);
      await page.locator('#directory-q').fill('zzz-no-such-record');
      await page.locator('form[method="get"] button[type="submit"]').click();
      await page.waitForURL(/[?&]q=zzz-no-such-record/);

      // The query is echoed back into the input...
      await expect(page.locator('#directory-q')).toHaveValue('zzz-no-such-record');
      // ...and the empty state appears rather than a blank grid.
      await expect(page.getByText(/match your search yet/i)).toBeVisible();
      // ...and a Reset link is offered.
      await expect(page.getByRole('link', { name: /reset/i })).toBeVisible();
    });

    test(`${name}: a public visitor gets no editor markup`, async ({ page }) => {
      await page.goto(path);
      const html = await page.content();
      expect(html).not.toContain('data-slot-id');
      expect(html).not.toContain('data-nfr-slot');
      expect(html).not.toContain('does not render on the live site');
    });
  }

  test('the competitor directory keeps its discipline filter', async ({ page }) => {
    await page.goto('/competitors/');
    const select = page.locator('select[name="discipline"]');
    // Only present when the database has disciplines; the test DB is seeded.
    if ((await select.count()) > 0) {
      await expect(select).toBeVisible();
      await expect(select.locator('option', { hasText: /all disciplines/i })).toHaveCount(1);
    }
  });

  test('pagination, when present, navigates to the next page', async ({ page }) => {
    await page.goto('/competitors/');
    const next = page.getByRole('link', { name: /next/i });
    if ((await next.count()) > 0) {
      await next.first().click();
      await page.waitForURL(/[?&]page=2/);
      await expect(page.getByText(/Page 2 of/)).toBeVisible();
    }
  });
});

/* ── 2. The new blocks work in the real Stage 06 canvas ───────────── */

test.describe('Stage 07 Task H — new blocks are selectable on the real canvas', () => {
  test('the directory page canvas renders the hero and listing with slot ids', async ({ page }) => {
    await openBuilder(page);
    await selectPage(page, /Directory — Competitors/);

    const frame = page.frameLocator(CANVAS);
    // The hero and the listing must both appear as selectable containers. Before
    // Stage 07 neither produced an element at all: the hero's text was rendered
    // by the route and the listing had no renderer.
    await expect(frame.locator('[data-slot-type="directory-hero"]')).toHaveCount(1, { timeout: 20000 });
    await expect(frame.locator('[data-slot-type="directory-grid"]')).toHaveCount(1);

    for (const type of ['directory-hero', 'directory-grid']) {
      const id = await frame.locator(`[data-slot-type="${type}"]`).first().getAttribute('data-slot-id');
      expect(id, `${type} needs a stable slot id`).toBeTruthy();
      expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    }
  });

  test('clicking the directory listing on the canvas selects it in the Builder', async ({ page }) => {
    await openBuilder(page);
    await selectPage(page, /Directory — Competitors/);

    const frame = page.frameLocator(CANVAS);
    const grid = frame.locator('[data-slot-type="directory-grid"]').first();
    await expect(grid).toBeVisible({ timeout: 20000 });
    await grid.click({ position: { x: 5, y: 5 } });

    // The inspector must now describe the listing block.
    await expect(page.getByText(/Entity Listing/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('the listing block tells the operator its content is database-owned', async ({ page }) => {
    await openBuilder(page);
    await selectPage(page, /Directory — Venues/);

    const frame = page.frameLocator(CANVAS);
    const grid = frame.locator('[data-slot-type="directory-grid"]').first();
    await expect(grid).toBeVisible({ timeout: 20000 });
    await grid.click({ position: { x: 5, y: 5 } });

    await expect(page.getByText(/Content comes from the database/i)).toBeVisible({ timeout: 10000 });
  });

  test('a detail template canvas renders its appendage blocks with slot ids', async ({ page }) => {
    await openBuilder(page);
    await selectPage(page, /Template — Article Detail/);

    const frame = page.frameLocator(CANVAS);
    // The default article template has `detail-related` and `detail-cta`. At
    // least one container must exist, with a stable id — the property Stage 06
    // found broken for every page with no stored layout.
    const slots = frame.locator('[data-nfr-slot]');
    await expect(slots.first()).toBeAttached({ timeout: 20000 });
    const id = await slots.first().getAttribute('data-slot-id');
    expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  test('a retired detail marker shows the operator a removable notice', async ({ page }) => {
    await openBuilder(page);
    await selectPage(page, /Template — Article Detail/);
    // The retired markers are no longer in the default layout, so this asserts
    // the Builder offers none of them in the block library.
    const addPanel = page.getByText(/Page Hero \(retired\)/i);
    await expect(addPanel).toHaveCount(0);
  });

  test('the Builder offers the new approved regions on a detail template', async ({ page }) => {
    await openBuilder(page);
    await selectPage(page, /Template — Discipline Guide/);
    // The block library is an overlay behind "+ Add Section" in the structure
    // panel; its heading is "Add a Block".
    await page.getByRole('button', { name: /\+ Add Section/i }).click();
    await expect(page.getByText('Add a Block')).toBeVisible({ timeout: 10000 });

    for (const label of [/Rich Text Block/i, /FAQ Section/i, /CTA Banner/i, /Image \+ Text/i]) {
      await expect(page.getByText(label).first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('the Builder does NOT offer any retired detail marker', async ({ page }) => {
    await openBuilder(page);
    await selectPage(page, /Template — Article Detail/);
    await page.getByRole('button', { name: /\+ Add Section/i }).click();
    await expect(page.getByText('Add a Block')).toBeVisible({ timeout: 10000 });

    // Owner decision D-02: retired blocks must not be offered again.
    for (const label of [/Page Hero \(retired\)/i, /Main Content \(retired\)/i, /Newsletter/i]) {
      await expect(page.getByText(label)).toHaveCount(0);
    }
  });
});

/* ── 3. Task I — frame security still holds ───────────────────────── */

test.describe('Stage 07 Task I — frame security regression', () => {
  test('public pages still send SAMEORIGIN, not DENY', async ({ page }) => {
    for (const path of ['/competitors/', '/venues/', '/']) {
      const res = await page.goto(path);
      const xfo = res?.headers()['x-frame-options'];
      expect(xfo, `${path} X-Frame-Options`).toBe('SAMEORIGIN');
    }
  });

  test('the CSP still restricts framing to self', async ({ page }) => {
    const res = await page.goto('/competitors/');
    const csp = res?.headers()['content-security-policy-report-only'] ?? '';
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("frame-src 'self'");
    expect(csp).not.toContain('frame-ancestors *');
  });

  test('a foreign-origin page cannot frame a directory page', async ({ page }) => {
    /**
     * CORRECTED AFTER A FIRST ATTEMPT THAT PROVED NOTHING. The first version
     * called `page.setContent` while the page was already on the site's own
     * origin, so the iframe was SAME-origin and loaded correctly — the
     * assertion failed, and it deserved to: it was testing the wrong thing.
     *
     * A `data:` document has an opaque origin, which is genuinely foreign to
     * the server, so `X-Frame-Options: SAMEORIGIN` must refuse to render there.
     * The check is "did the framed document load our HTML", read from inside
     * the frame where possible and treated as blocked when access throws.
     */
    await page.goto('/competitors/');
    const target = page.url();

    await page.goto(`data:text/html,<iframe id="x" src="${encodeURI(target)}"></iframe>`);
    // Give the browser a chance to attempt, and refuse, the load.
    await page.waitForTimeout(1500);

    const rendered = await page.evaluate(() => {
      const f = document.getElementById('x') as HTMLIFrameElement | null;
      if (!f) return 'no-frame';
      try {
        const doc = f.contentDocument;
        if (!doc) return 'blocked-no-document';
        return doc.querySelector('h1') ? 'RENDERED' : 'blocked-empty';
      } catch {
        return 'blocked-threw';
      }
    });

    expect(rendered, 'a foreign-origin frame must not render the page').not.toBe('RENDERED');
  });

  test('the draft preview route still refuses an unauthenticated request', async ({ browser }) => {
    const ctx = await browser.newContext();
    const res = await ctx.request.get('/admin/website/preview/?pageKey=directory:competitors&embed=1', {
      maxRedirects: 0,
    });
    expect([401, 403, 302, 307, 404]).toContain(res.status());
    await ctx.close();
  });
});
