import { test, expect, type Page } from '@playwright/test';
import { FIXTURE_SLUGS } from '../prisma/fixtures';
import { LEGAL_PAGES } from '../config/legalPages';
import { readState } from './support';

const SECTIONS = ['/competition/', '/entertainment/', '/events-shopping/', '/plan-watch/', '/rodeo-events/'];

async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  return raw.flatMap((t) => {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : [v];
  });
}

test.describe('public smoke', () => {
  test('homepage loads and the header links all five sections', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toBeVisible();
    for (const path of SECTIONS) {
      await expect(page.locator(`header a[href="${path}"]`).first()).toBeAttached();
    }
  });

  for (const path of SECTIONS) {
    test(`section ${path} loads`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator('h1').first()).toBeVisible();
    });
  }

  test('main navigation works (click through)', async ({ page }) => {
    await page.goto('/');
    await page.locator('header a[href="/plan-watch/"]').first().click();
    await expect(page).toHaveURL(/\/plan-watch\/$/);
  });

  test('mobile drawer exposes the five sections', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open mobile navigation menu' }).click();
    // The desktop nav is hidden at this width; check the links rendered visible in the drawer.
    for (const path of SECTIONS) await expect(page.locator(`a[href="${path}"]:visible`).first()).toBeVisible();
  });

  test('fixture article renders one H1 and one Article JSON-LD object', async ({ page }) => {
    const res = await page.goto(`/articles/${FIXTURE_SLUGS.publishedArticle}/`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    const ld = await jsonLd(page);
    const articles = ld.filter((o) => o['@type'] === 'Article' || o['@type'] === 'NewsArticle');
    expect(articles).toHaveLength(1);
    expect(articles[0]['@type']).toBe('Article'); // "Rules & Format" is not news
  });

  test('a News-type fixture emits NewsArticle', async ({ page }) => {
    await page.goto(`/articles/${FIXTURE_SLUGS.newsArticle}/`);
    const types = (await jsonLd(page)).map((o) => o['@type']);
    expect(types.filter((t) => t === 'NewsArticle')).toHaveLength(1);
    expect(types).not.toContain('Article');
  });

  test('JSON-LD script bodies contain no raw "<" anywhere (no script breakout)', async ({ page }) => {
    for (const path of ['/', `/articles/${FIXTURE_SLUGS.publishedArticle}/`, '/disciplines/bull-riding/']) {
      await page.goto(path);
      for (const body of await page.locator('script[type="application/ld+json"]').allTextContents()) {
        expect(body).not.toContain('<');
        JSON.parse(body);
      }
    }
  });

  test('legal pages show their draft / review notice and are noindex', async ({ page }) => {
    for (const p of LEGAL_PAGES) {
      const res = await page.goto(p.path);
      expect(res?.status(), p.path).toBe(200);
      await expect(page.getByText('Draft — pending owner and legal review')).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    }
  });

  test('unknown article returns 404', async ({ page }) => {
    const res = await page.goto('/articles/this-article-does-not-exist-e2e/');
    expect(res?.status()).toBe(404);
  });

  test('draft fixture article is not publicly accessible', async ({ page }) => {
    const res = await page.goto(`/articles/${FIXTURE_SLUGS.draftArticle}/`);
    expect(res?.status()).toBe(404);
    expect(await page.content()).not.toContain('Fixture: Draft Article');
  });

  test('a renamed published slug redirects to the live article', async ({ page }) => {
    const s = readState();
    const res = await page.goto(s.redirectSource);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${s.redirectTarget}$`));
  });

  test('edition pages never expose a purse figure', async ({ page }) => {
    // The fixture edition always exists; the Calgary edition exists only in databases that
    // still hold the Phase 0 demo seed — when present it must not show its stored purse.
    for (const path of [`/rodeo-events/${FIXTURE_SLUGS.events[0]}/${FIXTURE_SLUGS.editionSlug}/`, '/rodeo-events/calgary-stampede/2026/']) {
      const res = await page.goto(path);
      if (res?.status() === 404) continue;
      expect(res?.status(), path).toBe(200);
      const html = await page.content();
      expect(html).not.toMatch(/Purse/);
      expect(html).not.toMatch(/2,150,000|purseBenchmark/);
    }
    await page.goto(`/rodeo-events/${FIXTURE_SLUGS.events[0]}/${FIXTURE_SLUGS.editionSlug}/`);
    await expect(page.getByText('Dates to be confirmed')).toBeVisible();
  });
});
