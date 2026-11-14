import { test, expect, type Page } from '@playwright/test';
import { FIXTURE_SLUGS } from '../prisma/fixtures';
import { LEGAL_PAGES } from '../config/legalPages';
import { readState, testDb, openEditorArea } from './support';

/**
 * Stage 09 continuation — browser verification (Chromium) of the SEO admin UX
 * changes and the public structured data / sitemap they relate to. Runs against
 * `next start` on the isolated, seeded test database, like every other spec.
 * Read-only: nothing is saved, published or unpublished here.
 */

async function login(page: Page) {
  const s = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(s.adminEmail);
  await page.locator('#password').fill(s.adminPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/$/);
}

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  return raw.flatMap((t) => {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : [v];
  });
}

test.describe('Stage 09 — public structured data and sitemap', () => {
  test('the edition Event node carries an absolute url and no empty address', async ({ page }) => {
    const res = await page.goto(`/rodeo-events/${FIXTURE_SLUGS.events[0]}/${FIXTURE_SLUGS.editionSlug}/`);
    expect(res?.status()).toBe(200);
    const nodes = await jsonLd(page);
    const crumbs = nodes.find((n) => n['@type'] === 'BreadcrumbList');
    expect(crumbs, 'the edition page emits a breadcrumb').toBeTruthy();
    for (const n of nodes) {
      if (typeof n.url === 'string') expect(n.url, `${n['@type']} url`).toMatch(/^https?:\/\//);
      const loc = n.location as { address?: Record<string, unknown> } | undefined;
      if (loc?.address) expect(Object.keys(loc.address).length, 'address has fields beyond @type').toBeGreaterThan(1);
    }
  });

  test('the sitemap lists no pending legal page', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.status()).toBe(200);
    const xml = await res.text();
    for (const p of LEGAL_PAGES) {
      expect(xml, `${p.path} is noindex and must not be listed`).not.toMatch(new RegExp(`<loc>[^<]*${p.path}</loc>`));
    }
  });
});

test.describe('Stage 09 — SEO admin screens report the real state', () => {
  test('article editor shows the stored robots directive, not a hardcoded claim', async ({ page }) => {
    const db = testDb();
    const article = await db.article.findFirstOrThrow({ where: { slug: FIXTURE_SLUGS.publishedArticle }, select: { id: true } });
    await db.$disconnect();
    await login(page);
    await page.goto(`/admin/articles/${article.id}/edit/`);
    // The indexing status is on the SEO tab.
    await openEditorArea(page, 'seo');
    const status = page.getByTestId('seo-indexing-status');
    await expect(status).toBeVisible();
    await expect(page.getByTestId('seo-robots')).toHaveText(/^(no)?index, (no)?follow$/);
    await expect(status).not.toContainText('SSL Enforced');
    await expect(page.getByTestId('seo-canonical')).toHaveText(`https://nfrguide.com/articles/${FIXTURE_SLUGS.publishedArticle}/`);
  });

  test('landing SEO form: labelled fields and a live effective-canonical preview', async ({ page }) => {
    const db = testDb();
    const hub = await db.rodeoHub.findFirstOrThrow({ where: { slug: FIXTURE_SLUGS.hub }, select: { id: true } });
    await db.$disconnect();
    await login(page);
    await page.goto(`/admin/landing-seo/?type=RODEO_HUB&id=${hub.id}`);
    // Accessible names resolve through <label for>, so getByLabel finds the controls.
    const canonical = page.getByLabel('Canonical override (path or same-site URL)');
    await expect(canonical).toBeVisible();
    await expect(page.getByLabel('SEO title')).toHaveAttribute('maxlength', '160');
    const preview = page.getByTestId('landing-effective-canonical');
    await canonical.fill('https://example.org/elsewhere/');
    await expect(preview).toContainText('will be refused on save');
    await expect(canonical).toHaveAttribute('aria-invalid', 'true');
    await canonical.fill(`/rodeo-events/${FIXTURE_SLUGS.hub}/`);
    await expect(preview).toContainText(`/rodeo-events/${FIXTURE_SLUGS.hub}/ (override)`);
    // Nothing is saved: the page is left without pressing Save SEO.
  });

  test('info pages screen renders its workflow table with associated labels', async ({ page }) => {
    await login(page);
    await page.goto('/admin/info-pages/');
    await expect(page.getByRole('heading', { name: 'Info & Legal Pages' })).toBeVisible();
    for (const p of LEGAL_PAGES) await expect(page.locator('td', { hasText: new RegExp(`^${p.slug}$`) })).toBeVisible();
    await page.getByRole('button', { name: '+ Create New Page' }).click();
    await expect(page.getByLabel('Slug (URL path)')).toBeVisible();
    await expect(page.getByLabel('Meta Description')).toBeVisible();
  });
});
