import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import { readState } from './support';

/**
 * Admin hydration regression guard.
 *
 * A hydration mismatch was observed on `/admin/` during manual QA, and the
 * session that saw it did not establish whether it was pre-existing or
 * introduced by the Rodeo Coverage work. This spec reproduces the condition in
 * a controlled environment and fails if a real mismatch is present.
 *
 * IMPORTANT ABOUT WHAT THIS CAN SEE. React only emits hydration diagnostics in
 * a development build; `next start` does not produce them, so against the
 * default production webServer this spec passes trivially. Run it against a dev
 * server on the same port (`reuseExistingServer` picks it up) to make it
 * meaningful. It is written to be correct either way rather than to look busy.
 */

async function login(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

/**
 * Attributes injected into the DOM by local security software or browser
 * extensions BEFORE React hydrates.
 *
 * `bis_skin_checked` is Bitdefender's. React's own message names this cause
 * ("a browser extension installed which messes with the HTML before React
 * loaded"), and the evidence here is unambiguous: the attribute appears zero
 * times in the server-rendered HTML (`curl | grep -c` → 0) and zero times in
 * stored content, so no application code produces it. A mismatch caused solely
 * by one of these is an artefact of the machine the browser runs on, not a
 * defect in this codebase, and failing the build for it would teach everyone
 * to ignore this test.
 *
 * A mismatch naming anything else still fails.
 */
const EXTERNAL_INJECTION = /bis_skin_checked|data-new-gr-c-s-check-loaded|data-gr-ext-installed|cz-shortcut-listen/;

/** React's hydration diagnostics, by their stable wording. */
const HYDRATION_PATTERNS = [
  /hydration failed/i,
  /did not match/i,
  /text content does not match server-rendered html/i,
  /server rendered html didn't match the client/i,
  /a tree hydrated but some attributes/i,
];

function collect(page: Page) {
  const messages: string[] = [];
  const onConsole = (m: ConsoleMessage) => {
    if (m.type() === 'error' || m.type() === 'warning') messages.push(m.text());
  };
  const onPageError = (e: Error) => messages.push(`pageerror: ${e.message}`);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  return {
    messages,
    hydration: () => messages
      .filter((t) => HYDRATION_PATTERNS.some((p) => p.test(t)))
      .filter((t) => !EXTERNAL_INJECTION.test(t)),
  };
}

test.describe('Admin hydration', () => {
  // `/` is included because that is where the reported mismatch actually
  // occurred — the earlier QA note attributed it to `/admin/`, which the
  // component stack disproved (it read `pathname="/"`).
  for (const path of ['/', '/admin/', '/admin/rodeo-coverage/']) {
    test(`no hydration mismatch on ${path}`, async ({ page }) => {
      const captured = collect(page);
      if (path.startsWith('/admin')) await login(page);
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      // Hydration diagnostics are emitted during client bootstrap; give React
      // a moment past load before judging.
      await page.waitForTimeout(1200);

      const hits = captured.hydration();
      expect(hits, `hydration diagnostics on ${path}:\n${hits.join('\n')}`).toEqual([]);
    });
  }

  test('the Rodeo Coverage table renders identically after hydration', async ({ page }) => {
    /**
     * A targeted check for the class of mismatch this workstream could
     * plausibly have introduced: the lifecycle filter and status badges derive
     * from `archivedAt`, a Date. Formatting a Date differently on server and
     * client is the classic cause of a mismatch, so the rendered row text is
     * compared before and after hydration settles.
     */
    await login(page);
    await page.goto('/admin/rodeo-coverage/');

    /**
     * `textContent`, not `innerText`.
     *
     * `innerText` is CSS-dependent: it applies `text-transform` and derives
     * whitespace from layout. Sampling it "immediately" therefore races the
     * stylesheet, and the same unchanged DOM reads as `Active` before styles
     * apply and `ACTIVE` after — a flake that says nothing about hydration.
     * `textContent` is CSS-independent and still carries every rendered string,
     * so a Date formatted differently on server and client — the mismatch this
     * test exists to catch — is detected exactly as before.
     */
    const firstRowImmediate = await page.locator('tbody tr').first().textContent();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    const firstRowSettled = await page.locator('tbody tr').first().textContent();

    expect(firstRowSettled, 'row content must not change once React takes over').toBe(firstRowImmediate);
  });

  test('status badges carry no locale- or timezone-formatted date in the DOM', async ({ page }) => {
    /**
     * The archive badge shows a date only in its `title` attribute, formatted
     * with `toISOString().slice(0,10)` — deliberately locale- and
     * timezone-independent. `toLocaleDateString()` here would render
     * differently on a server in UTC and a browser in another zone, which is
     * exactly how this kind of mismatch appears.
     */
    await login(page);
    await page.goto('/admin/rodeo-coverage/');
    const titles = await page.locator('tbody [title^="Archived "]').evaluateAll(
      (els) => els.map((e) => e.getAttribute('title') ?? ''),
    );
    for (const t of titles) {
      expect(t, 'archive dates must be ISO, not locale-formatted').toMatch(/^Archived \d{4}-\d{2}-\d{2}$/);
    }
  });
});
