import { test, expect, type Page } from '@playwright/test';
import { readState, testDb } from './support';

/**
 * The complete publication journey, over HTTP (brief §8).
 *
 * The previous report could not claim this. Information pages are statically
 * rendered with no `revalidate`, so a row written straight into the database
 * never reaches HTTP — which made a direct-write test look like a product bug
 * and proved nothing either way. This spec drives the REAL admin path instead:
 * the server actions run, `revalidatePath` runs with them, and the public URL
 * is then fetched like any reader would fetch it.
 *
 * What it is really testing is one promise: **publishing is the only thing
 * that changes what a visitor sees.**
 */
const SLUG = `e2e-pub-${Date.now().toString(36)}`;
const PUBLIC_PATH = `/info/${SLUG}/`;
const PREVIEW_PATH = `/admin/info-pages/${SLUG}/preview/`;

async function login(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

/** Types into the rich editor, replacing whatever is there. */
async function typeBody(page: Page, body: string) {
  const surface = page.getByTestId('info-body-editor').locator('.prose-editor');
  await surface.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(body);
}

/** Drives the real screen: fill the editor, then save. */
async function saveDraft(page: Page, title: string, body: string) {
  await page.goto('/admin/info-pages/');
  const row = page.locator('tr', { hasText: SLUG }).first();
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByTestId('info-body-editor')).toBeVisible();

  await page.getByLabel('Title', { exact: true }).fill(title);
  await typeBody(page, body);

  await page.getByRole('button', { name: 'Save Draft' }).click();
  await page.waitForTimeout(600);
}

/**
 * Fetches the public URL until it shows `expected`, or gives up.
 *
 * `revalidatePath` invalidates a cache entry; the page is then rebuilt on the
 * next request. A single fetch immediately after clicking Publish can
 * therefore still be served the previous render — a race, not a defect, and
 * polling is what distinguishes the two.
 */
async function publicHtmlContaining(
  request: import('@playwright/test').APIRequestContext,
  expected: string,
): Promise<string> {
  let html = '';
  for (let i = 0; i < 20; i++) {
    const res = await request.get(PUBLIC_PATH);
    html = await res.text();
    if (html.includes(expected)) return html;
    await new Promise((r) => setTimeout(r, 500));
  }
  return html;
}

async function publish(page: Page) {
  await page.goto('/admin/info-pages/');
  const row = () => page.locator('tr', { hasText: SLUG }).first();
  await row().getByRole('button', { name: 'Submit' }).click();
  await page.waitForTimeout(400);
  await row().getByRole('button', { name: 'Approve' }).click();
  await page.waitForTimeout(400);
  await row().getByRole('button', { name: 'Publish', exact: true }).click();
  await page.waitForTimeout(600);
}

test.describe('an information page, created and published through the admin', () => {
  test.afterAll(async () => {
    const db = testDb();
    await db.infoPage.deleteMany({ where: { slug: SLUG } });
    await db.$disconnect();
  });

  test('V1 publishes, V2 stays private until published, and old revisions survive', async ({ page, request }) => {
    test.setTimeout(180_000);
    await login(page);

    // ---- 1. Create and save V1 through the real screen -------------------
    await page.goto('/admin/info-pages/');
    await page.getByRole('button', { name: '+ Create New Page' }).click();
    await page.getByLabel('Slug').fill(SLUG);
    await page.getByLabel('Title', { exact: true }).fill('Version One');
    // Create Draft stays disabled until slug, title AND body are present.
    await typeBody(page, 'ONE HUNDRED PERCENT V1 BODY.');
    await expect(page.getByRole('button', { name: 'Create Draft' })).toBeEnabled();
    await page.getByRole('button', { name: 'Create Draft' }).click();
    await expect(page.locator('tr', { hasText: SLUG }).first()).toBeVisible();

    // ---- 2. The draft is NOT public before publication --------------------
    let res = await request.get(PUBLIC_PATH);
    expect(res.status(), 'an unpublished page must not be reachable').toBe(404);

    // ---- 3. Secure preview is staff-only ---------------------------------
    const anon = await page.context().browser()!.newContext();
    const anonRes = await anon.request.get(PREVIEW_PATH, { maxRedirects: 0 }).catch(() => null);
    expect(
      anonRes === null || anonRes.status() >= 300,
      'an unauthenticated request must never receive draft content',
    ).toBe(true);
    if (anonRes) expect(await anonRes.text().catch(() => '')).not.toContain('V1 BODY');
    await anon.close();

    // ...and IS available to the signed-in editor, with noindex.
    await page.goto(PREVIEW_PATH);
    await expect(page.getByText('Draft preview — not public')).toBeVisible();
    await expect(page.getByTestId('preview-frame')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What changes if you publish' })).toBeVisible();

    // ---- 4. Publish V1, then read the PUBLIC url over HTTP ----------------
    await publish(page);
    let html = await publicHtmlContaining(request, 'V1 BODY');
    expect((await request.get(PUBLIC_PATH)).status(), 'the published page is now reachable').toBe(200);
    expect(html).toContain('V1 BODY');
    expect(html, 'a published page is indexable').not.toContain('name="robots" content="noindex');

    // ---- 5. Write V2. Visitors must still get V1. -------------------------
    await saveDraft(page, 'Version Two', 'COMPLETELY DIFFERENT V2 BODY.');

    res = await request.get(PUBLIC_PATH);
    html = await res.text();
    expect(html, 'the live page is untouched while V2 is written').toContain('V1 BODY');
    expect(html).not.toContain('V2 BODY');

    // The editor can see V2; the public cannot.
    await page.goto(PREVIEW_PATH);
    await expect(page.getByTestId('preview-frame')).toContainText('V2 BODY');

    // ---- 6. Publish V2 — now the public URL changes -----------------------
    await publish(page);
    html = await publicHtmlContaining(request, 'V2 BODY');
    expect(html, 'publishing is what moves the live page').toContain('V2 BODY');
    expect(html).not.toContain('V1 BODY');

    // ---- 7. V1 is still recoverable, and restoring does not disturb V2 ----
    await page.goto('/admin/info-pages/');
    await page.locator('tr', { hasText: SLUG }).first().getByRole('button', { name: 'Revisions' }).click();
    await expect(page.getByRole('heading', { name: /Revisions/ })).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Load into draft' }).last().click();
    await page.waitForTimeout(600);

    res = await request.get(PUBLIC_PATH);
    expect(await res.text(), 'a restore loads the draft, not the live page').toContain('V2 BODY');
  });
});
