import { test, expect, type Page } from '@playwright/test';
import { readState } from './support';

/**
 * Slug editor and REAL HTTP redirects.
 *
 * The service tests assert the stored redirect rows. This spec asserts what a
 * visitor actually receives, because a correct row proves nothing if no route
 * consults it — which was exactly the defect this round was called to fix for
 * nested edition URLs.
 */

async function login(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

// Title has spaces and capitals so the rendered TITLE cell never equals the
// SLUG cell — otherwise a text locator matches both and trips strict mode.
const uniq = () => `E2E Slug ${Date.now().toString(36)} ${Math.random().toString(36).slice(2, 6)}`;

/** Create a hub through the real admin UI and return its generated slug. */
async function createHub(page: Page, title: string): Promise<string> {
  await page.goto('/admin/rodeo-coverage/');
  await page.getByRole('button', { name: '+ Add Hub' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('input').first().fill(title);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  await expect(slugRow(page, slug)).toBeVisible();
  return slug;
}

/**
 * The table row for a given slug.
 *
 * Rows are matched rather than cells: the slug appears in exactly one row, and
 * asserting on a cell tripped strict mode when the title cell happened to hold
 * the same text.
 */
function slugRow(page: Page, slug: string) {
  return page.locator('tbody tr').filter({ hasText: slug });
}

/** Open the slug modal for the row whose slug cell matches. */
async function openSlugModal(page: Page, slug: string) {
  await slugRow(page, slug).getByRole('button', { name: 'Slug' }).click();
  return page.getByRole('dialog');
}

/**
 * The redirect target, normalised.
 *
 * Next sends `Location` as a site-relative path, and this deployment emits the
 * header twice with the same value — Playwright joins repeats with ", ". Both
 * are harmless (a browser takes the first, and they are identical), but the
 * assertion has to account for them rather than appear to fail.
 */
function locationOf(headers: Record<string, string>): string {
  return (headers['location'] ?? '').split(',')[0].trim();
}

test.describe('Slug editor and HTTP redirects', () => {
  test('the modal previews the real URL and explains the redirect', async ({ page }) => {
    await login(page);
    const title = uniq();
    const slug = await createHub(page, title);

    const dialog = await openSlugModal(page, slug);
    await expect(dialog).toBeVisible();

    // Current URL is shown, not just the bare slug.
    await expect(dialog).toContainText(`/rodeo-events/${slug}/`);

    // Live preview normalises as the server will.
    const input = dialog.locator('#slug-input');
    await input.fill('Some MESSY  Input!!');
    await expect(dialog).toContainText('/rodeo-events/some-messy-input/');

    // The consequence is stated before the operator commits.
    await expect(dialog).toContainText(/permanent \(HTTP 308\) redirect/i);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('validation blocks a reserved slug and Save stays disabled', async ({ page }) => {
    await login(page);
    const slug = await createHub(page, uniq());
    const dialog = await openSlugModal(page, slug);

    await dialog.locator('#slug-input').fill('admin');
    await expect(dialog).toContainText(/reserved path/i);
    await expect(dialog.getByRole('button', { name: 'Save slug' })).toBeDisabled();

    // Unchanged input is also refused, with its own explanation.
    await dialog.locator('#slug-input').fill(slug);
    await expect(dialog).toContainText(/already the current slug/i);
    await expect(dialog.getByRole('button', { name: 'Save slug' })).toBeDisabled();

    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('Escape closes the modal and changes nothing', async ({ page }) => {
    await login(page);
    const slug = await createHub(page, uniq());
    const dialog = await openSlugModal(page, slug);
    await dialog.locator('#slug-input').fill('something-else');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    // The row still shows the original slug.
    await expect(slugRow(page, slug)).toBeVisible();
  });

  test('saving a slug produces a REAL 308 redirect at the old URL', async ({ page, request }) => {
    await login(page);
    const oldSlug = await createHub(page, uniq());
    const newSlug = `${oldSlug}-moved`;

    // The old URL serves a page before the change.
    const before = await request.get(`/rodeo-events/${oldSlug}/`, { maxRedirects: 0 });
    expect(before.status(), 'the hub page exists first').toBe(200);

    const dialog = await openSlugModal(page, oldSlug);
    await dialog.locator('#slug-input').fill(newSlug);
    await dialog.getByRole('button', { name: 'Save slug' }).click();
    await expect(dialog).toBeHidden();
    await expect(slugRow(page, newSlug)).toBeVisible();

    // THE POINT OF THIS SPEC: a real HTTP response, not a database row.
    const moved = await request.get(`/rodeo-events/${oldSlug}/`, { maxRedirects: 0 });
    expect(moved.status(), 'old URL must be a permanent redirect').toBe(308);
    expect(locationOf(moved.headers())).toBe(`/rodeo-events/${newSlug}/`);

    // And the destination actually serves the page.
    const dest = await request.get(`/rodeo-events/${newSlug}/`, { maxRedirects: 0 });
    expect(dest.status()).toBe(200);
  });

  test('a renamed PARENT event redirects its nested edition URL over HTTP', async ({ page, request }) => {
    /**
     * The defect this correction round exists to fix: the nested route did not
     * consult the redirect store, so `/rodeo-events/<old>/<edition>/` 404'd
     * after a parent rename even though the redirect row had been written.
     *
     * Driven against a SEEDED event that already has an edition. An earlier
     * version created the edition through the admin form and spent its budget
     * fighting that form's selectors — which tested the form, not the redirect.
     */
    await login(page);

    // Find a seeded event with at least one edition, from the public sitemap.
    const sitemap = await (await request.get('/sitemap.xml')).text();
    const nested = [...sitemap.matchAll(/<loc>[^<]*\/rodeo-events\/([a-z0-9-]+)\/([a-z0-9-]+)\/<\/loc>/g)][0];
    test.skip(!nested, 'no seeded event with an edition in this database');

    const [, eventSlug, editionSlug] = nested!;
    const nestedOld = `/rodeo-events/${eventSlug}/${editionSlug}/`;
    expect((await request.get(nestedOld, { maxRedirects: 0 })).status(), 'nested page exists first').toBe(200);

    await page.goto('/admin/rodeo-coverage/');
    await page.getByRole('button', { name: /Recurring Events/ }).click();
    /**
     * The Recurring Events table has no slug COLUMN, so the row cannot be
     * located by slug text. The admin's search box does match on slug, so it
     * is used to narrow to the single target row.
     */
    await page.locator('#rodeo-search').fill(eventSlug);
    const row = page.locator('tbody tr');
    await expect(row).toHaveCount(1);

    const newEventSlug = `${eventSlug}-renamed-${Math.random().toString(36).slice(2, 6)}`;
    await row.getByRole('button', { name: 'Slug' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#slug-input').fill(newEventSlug);
    // The nested-URL warning appears only once the slug actually differs.
    await expect(dialog).toContainText(/Every edition URL under this event is redirected too/i);
    await dialog.getByRole('button', { name: 'Save slug' }).click();
    await expect(dialog).toBeHidden();

    // The nested OLD url must now permanently redirect to the nested NEW url.
    const moved = await request.get(nestedOld, { maxRedirects: 0 });
    expect(moved.status(), 'nested old URL must redirect, not 404').toBe(308);
    expect(locationOf(moved.headers())).toBe(`/rodeo-events/${newEventSlug}/${editionSlug}/`);
    expect((await request.get(`/rodeo-events/${newEventSlug}/${editionSlug}/`, { maxRedirects: 0 })).status()).toBe(200);

    /**
     * RESTORE THE SEEDED SLUG. This test is the only one that renames a real
     * seeded event, and it used to leave it renamed.
     *
     * That had two consequences. Across runs the suffixes accumulated, until
     * the event read
     * `calgary-stampede-renamed-akrp-renamed-...-renamed-78jr`. And WITHIN a
     * run it broke `public.spec.ts`, which asserts HTTP 200 for the canonical
     * `/rodeo-events/calgary-stampede/2026/` — once this test had moved the
     * slug, that URL answered 308 and a spec failed for a reason it did not
     * contain. Whether the suite passed depended on which file Playwright ran
     * first.
     *
     * Restoring here makes both specs order-independent. The redirect rows this
     * rename created are left in place: they are real history, the assertions
     * above have already been made, and `global-setup` tolerates them.
     */
    await page.locator('#rodeo-search').fill(newEventSlug);
    const renamedRow = page.locator('tbody tr');
    await expect(renamedRow).toHaveCount(1);
    await renamedRow.getByRole('button', { name: 'Slug' }).click();
    const restore = page.getByRole('dialog');
    await restore.locator('#slug-input').fill(eventSlug);
    await restore.getByRole('button', { name: 'Save slug' }).click();
    await expect(restore).toBeHidden();
    expect(
      (await request.get(nestedOld, { maxRedirects: 0 })).status(),
      'the seeded canonical URL must serve again, so sibling specs are unaffected',
    ).toBe(200);
  });

  test('renaming twice never produces a redirect chain over HTTP', async ({ page, request }) => {
    await login(page);
    const first = await createHub(page, uniq());
    const second = `${first}-b`;
    const third = `${first}-c`;

    let dialog = await openSlugModal(page, first);
    await dialog.locator('#slug-input').fill(second);
    await dialog.getByRole('button', { name: 'Save slug' }).click();
    await expect(dialog).toBeHidden();

    dialog = await openSlugModal(page, second);
    await dialog.locator('#slug-input').fill(third);
    await dialog.getByRole('button', { name: 'Save slug' }).click();
    await expect(dialog).toBeHidden();

    // The ORIGINAL url must reach the final one in a single hop.
    const hop = await request.get(`/rodeo-events/${first}/`, { maxRedirects: 0 });
    expect(hop.status()).toBe(308);
    expect(locationOf(hop.headers()), 'one hop, not a chain').toBe(`/rodeo-events/${third}/`);
  });

  for (const [label, width] of [['desktop', 1280], ['tablet', 768], ['phone', 390]] as const) {
    test(`the slug modal is usable at ${label} ${width}`, async ({ page }) => {
      await login(page);
      const slug = await createHub(page, uniq());
      await page.setViewportSize({ width, height: 900 });

      const dialog = await openSlugModal(page, slug);
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('#slug-input')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Save slug' })).toBeVisible();

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'no horizontal page scroll').toBeLessThanOrEqual(1);

      await dialog.getByRole('button', { name: 'Cancel' }).click();
    });
  }
});
