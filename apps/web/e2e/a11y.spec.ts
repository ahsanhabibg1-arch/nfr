import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { FIXTURE_SLUGS } from '../prisma/fixtures';
import { E2E_DIR, readState, testDb, openEditorArea } from './support';

/**
 * Basic automated accessibility checks (Batch A, A7). This is NOT a WCAG 2.2 AA conformance
 * claim: axe finds a subset of issues; contrast in context, reading order, screen-reader UX,
 * zoom/reflow and reduced-motion behaviour still need manual review.
 *
 * Policy: any serious/critical axe violation fails, unless it is recorded in
 * e2e/a11y-known-issues.json (page + rule + reason) — known debt is listed, never hidden.
 */
type Known = { page: string; rule: string; reason: string };
const KNOWN: Known[] = JSON.parse(fs.readFileSync(path.join(E2E_DIR, 'a11y-known-issues.json'), 'utf8'));
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const unknown = blocking.filter((v) => !KNOWN.some((k) => k.page === label && k.rule === v.id));
  const known = blocking.filter((v) => KNOWN.some((k) => k.page === label && k.rule === v.id));
  test.info().annotations.push({
    type: 'axe',
    description: `${label}: ${results.violations.length} violation(s) [${results.violations.map((v) => `${v.id}:${v.impact}`).join(', ') || 'none'}]; known serious/critical: ${known.map((v) => v.id).join(', ') || 'none'}`,
  });
  for (const v of blocking) {
    test.info().annotations.push({ type: `axe:${v.id}`, description: `${label} · ${v.impact} · ${v.nodes.length} node(s) · e.g. ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}` });
  }
  expect(unknown.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`), `${label}: new serious/critical axe violations`).toEqual([]);
}

async function structure(page: Page, label: string) {
  const levels = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll((hs) => hs.map((h) => Number(h.tagName[1])));
  expect(levels.filter((l) => l === 1), `${label}: exactly one h1`).toHaveLength(1);
  const jumps: string[] = [];
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) jumps.push(`h${levels[i - 1]}→h${levels[i]}`);
  }
  if (jumps.length) test.info().annotations.push({ type: 'heading-jump', description: `${label}: ${jumps.join(', ')}` });
  const knownJump = KNOWN.some((k) => k.page === label && k.rule === 'heading-jump');
  expect(knownJump ? [] : jumps, `${label}: heading level jumps (skipped levels)`).toEqual([]);
  expect(await page.locator('img:not([alt])').count(), `${label}: images without alt`).toBe(0);
  await expect(page.locator('main'), `${label}: <main> landmark`).toHaveCount(1);
}

async function focusVisible(page: Page, label: string) {
  await page.keyboard.press('Tab');
  const info = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    return { tag: el.tagName, outline: s.outlineStyle !== 'none' && s.outlineWidth !== '0px', ring: s.boxShadow !== 'none' };
  });
  expect(info, `${label}: Tab moves focus to an element`).not.toBeNull();
  expect(info!.outline || info!.ring, `${label}: focused ${info!.tag} has a visible focus indicator`).toBe(true);
}

const PUBLIC_PAGES: [string, string][] = [
  ['home', '/'],
  ['section', '/competition/'],
  ['article', `/articles/${FIXTURE_SLUGS.publishedArticle}/`],
  ['legal', '/about/'],
  ['discipline', '/disciplines/bull-riding/'],
  ['rodeo-event', `/rodeo-events/${FIXTURE_SLUGS.events[0]}/`],
  ['edition', `/rodeo-events/${FIXTURE_SLUGS.events[0]}/${FIXTURE_SLUGS.editionSlug}/`],
  ['login', '/admin/login/'],
];

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

/** Visible label text of every editor control fixed in Batch B (label ↔ control association). */
const EDITOR_LABELLED_CONTROLS = [
  // The Article Type label no longer carries a hardcoded "(18 Typologies)":
  // Batch 04-E made the vocabulary administrator-managed, so a fixed count in a
  // visible label would have been exactly the hardcoding that batch removed.
  // The control is still asserted to be reachable by its visible label.
  'Change Workflow State', 'Assigned Reviewer', 'Article Type', 'Primary Section', 'Subcategory',
  'Author Byline', 'Monetization Disclosure', 'Usage Rights Status', 'Photographer / Agency Credit', 'Caption',
];

/** Batch D — admin areas audited while authenticated (axe + heading structure). */
const ADMIN_PAGES: [string, string][] = [
  ['admin-media', '/admin/media/'],
  ['admin-seo', '/admin/seo/'],
  ['admin-monetization', '/admin/monetization/'],
  ['admin-team', '/admin/team/'],
  ['admin-settings', '/admin/settings/'],
];

/** Batch D — controls that had no accessible name; each must resolve by its label. */
const ADMIN_LABELLED_CONTROLS: [string, string[]][] = [
  ['/admin/media/', ['Search media', 'Filter by file type', 'Filter by visibility', 'Filter by usage', 'Filter by upload date']],
  ['/admin/team/', ['Search staff by name or email', 'Filter by role', 'Filter by status']],
  ['/admin/settings/', ['Site name', 'Contact email', 'Tagline', 'Description', 'Editorial email', 'Twitter/X URL', 'Facebook URL', 'Instagram URL']],
];

test.describe('accessibility (automated subset)', () => {
  for (const [label, url] of PUBLIC_PAGES) {
    test(`${label} (${url})`, async ({ page }) => {
      await page.goto(url);
      await audit(page, label);
      if (label !== 'login') await structure(page, label);
      await focusVisible(page, label);
    });
  }

  /**
   * Full-project audit addition. The static `PUBLIC_PAGES` list above covers one
   * page of each template EXCEPT the category archive, and a live audit of every
   * sitemap URL found a skipped heading level on every category page (the
   * article grid's `h3` cards rendered straight after the page `h1`). The slug
   * is read from the database rather than hardcoded, because categories are
   * CMS-owned rows, not configuration.
   */
  test('category archive (first category in the database)', async ({ page }) => {
    const db = testDb();
    let slug: string | null = null;
    try {
      const c = await db.category.findFirst({ orderBy: { sortOrder: 'asc' }, select: { slug: true } });
      slug = c?.slug ?? null;
    } finally {
      await db.$disconnect();
    }
    test.skip(!slug, 'no Category rows in the test database');
    await page.goto(`/categories/${slug}/`);
    await audit(page, 'category');
    await structure(page, 'category');
    await focusVisible(page, 'category');
  });

  test('reduced-motion preference: pages still render and remain usable', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1').first()).toBeVisible();
    await ctx.close();
  });

  test('admin editor (authenticated)', async ({ page }) => {
    await loginAsFixtureAdmin(page);
    await page.goto(await fixtureEditPath());
    await audit(page, 'admin-editor');
  });

  test('admin overview (authenticated)', async ({ page }) => {
    await loginAsFixtureAdmin(page);
    await audit(page, 'admin-overview');
  });

  for (const [label, url] of ADMIN_PAGES) {
    test(`${label} (${url}, authenticated)`, async ({ page }) => {
      // Data-heavy admin pages can take longer to render + axe-analyze
      test.setTimeout(60_000);
      await loginAsFixtureAdmin(page);
      await page.goto(url);
      await expect(page.locator('main h1')).toBeVisible();
      await audit(page, label);
      await structure(page, label);
    });
  }

  for (const [url, labels] of ADMIN_LABELLED_CONTROLS) {
    test(`every ${url} filter/field has an accessible name`, async ({ page }) => {
      await loginAsFixtureAdmin(page);
      await page.goto(url);
      for (const l of labels) {
        await expect(page.getByLabel(l, { exact: true }).first(), `control labelled "${l}" on ${url}`).toBeAttached();
      }
    });
  }

  test('admin team: the invite dialog is named, takes focus and returns it on Escape', async ({ page }) => {
    await loginAsFixtureAdmin(page);
    await page.goto('/admin/team/');
    const opener = page.getByRole('button', { name: 'Invite Staff' });
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAccessibleName(/.+/);
    await expect(dialog.getByLabel('Email', { exact: true })).toBeAttached();
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
    await audit(page, 'admin-team-invite');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('every editor input and select is reachable by its visible label', async ({ page }) => {
    await loginAsFixtureAdmin(page);
    await page.goto(await fixtureEditPath());
    for (const label of EDITOR_LABELLED_CONTROLS) {
      await expect(page.getByLabel(label, { exact: false }).first(), `control labelled "${label}"`).toBeAttached();
    }
    /*
      A focused editor field shows the shared focus ring (utilities cannot
      remove it).

      The tab is opened first. The editor became a tab set in the UX
      modernisation, and the Subcategory control sits on Setup — mounted but
      `hidden`, so it stayed attached (the loop above still passed) while
      `.focus()` silently left focus on <body> and the ring was measured on an
      element that was never focused. Opening the tab is what a user does before
      reaching the field, and it restores what this assertion was written for.
    */
    await openEditorArea(page, 'setup');
    const subcategory = page.locator('#editor-subcategory');
    await subcategory.focus();
    await expect(subcategory).toBeFocused();
    const ring = await subcategory.evaluate((el) => {
      const s = getComputedStyle(el);
      return { outline: s.outlineStyle, width: s.outlineWidth, shadow: s.boxShadow };
    });
    expect(ring.outline).toBe('solid');
    expect(ring.width).toBe('2px');
    expect(ring.shadow).not.toBe('none');
  });

  test('header animated search: trigger + input are accessible; Escape returns focus', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Search' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    const input = page.getByRole('searchbox', { name: 'Search NFRGuide' });
    await expect(input).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // Escape collapses and returns focus to the trigger (keyboard users never get trapped).
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });

  test('keyboard: the mobile drawer opens and closes without a mouse', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const open = page.getByRole('button', { name: 'Open mobile navigation menu' });
    await open.focus();
    await page.keyboard.press('Enter');
    const close = page.getByRole('button', { name: 'Close mobile menu' });
    await expect(close).toBeVisible();
    await close.focus();
    await page.keyboard.press('Enter');
    await expect(close).toHaveCount(0);
  });
});
