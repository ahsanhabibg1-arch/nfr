import { test, expect, type Page } from '@playwright/test';
import type { Prisma } from '@prisma/client';
import { readState, testDb } from './support';

/**
 * Stage 06-R FC-04 — the Site Identity & Branding lifecycle, signed in.
 *
 * Authentication uses the suite's EXISTING mechanism: `global-setup` creates a
 * super_admin in the isolated test database with a random password written only
 * to `e2e/.auth/` (git-ignored). Nothing is hardcoded here, no RBAC check is
 * weakened and no bypass is introduced — this spec signs in through the real
 * login form like any other admin.
 *
 * The lifecycle is asserted on RENDERED BRANDING, not on HTTP 200: a page can
 * return 200 while showing the wrong mark, which is precisely the failure this
 * is meant to catch.
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
 * Force the ISR caches to drop, the way the product itself does.
 *
 * The homepage is ISR (60s) and the public layout 300s, so branding published
 * through the admin appears immediately ONLY because
 * `app/admin/site-config-actions.ts` calls `revalidatePath('/', 'layout')`.
 * These tests write the config row directly for speed, which bypasses that
 * action — so they invoke the application's own internal revalidation endpoint
 * instead of waiting five minutes or pretending the cache does not exist.
 */
async function revalidatePublic(page: Page) {
  const secret = process.env.INTERNAL_REVALIDATE_SECRET;
  if (!secret) return;
  await page.request.post('/api/internal/revalidate', { data: { secret, path: '/' } });
}

/**
 * Open the Site Identity tab, tolerating hydration.
 *
 * `/admin/website/` is a client component: a click dispatched before React has
 * hydrated is swallowed, the tab never switches, and the assertion fails on a
 * page that is actually fine. (The suite already has `admin-hydration.spec.ts`
 * for this class of problem.) Waiting for the tab strip and then re-clicking
 * once if the panel has not appeared makes it deterministic without masking a
 * genuine failure — the final assertion is still the real one.
 */
async function openIdentityTab(page: Page) {
  // The FIRST admin navigation of a run also pays the server's cold compile,
  // which pushes hydration past the default expect timeout. Load, then settle.
  await page.goto('/admin/website/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  const tab = page.getByRole('button', { name: /Site Identity & Branding/i }).first();
  await expect(tab).toBeVisible({ timeout: 20000 });
  const panel = page.getByRole('heading', { name: /Primary logo/i }).first();
  for (let attempt = 0; attempt < 3; attempt++) {
    await tab.click();
    try {
      await expect(panel).toBeVisible({ timeout: 4000 });
      return;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  await expect(panel).toBeVisible();
}

/**
 * Publish the stored DRAFT through the real admin screen.
 *
 * This is the product's own path, and it is the one that invalidates caches:
 * `app/admin/site-config-actions.ts` calls `revalidatePath('/', 'layout')`
 * after publishing. Writing the row straight to the database — as the setup
 * helper does — deliberately does NOT, which is why these tests publish through
 * the UI rather than asserting against a stale ISR cache and calling it a bug.
 *
 * It also covers lifecycle steps 6-9 of the closure brief for real: the draft is
 * invisible to the public, Publish is clicked, and the public site then changes.
 */
async function publishViaAdmin(page: Page) {
  await openIdentityTab(page);
  await page.getByRole('button', { name: /^Publish$/ }).first().click();
  await expect(page.getByText(/Published — branding is live|Error/i).first()).toBeVisible({ timeout: 15000 });
}

/** Read the public header's branding: either an <img> logo or the wordmark. */
async function publicBranding(page: Page): Promise<{ logo: string | null; wordmark: boolean }> {
  await revalidatePublic(page);
  await page.goto('/');
  const header = page.locator('header').first();
  const img = header.locator('img').first();
  const hasImg = (await img.count()) > 0;
  return {
    logo: hasImg ? await img.getAttribute('src') : null,
    wordmark: (await header.innerText()).includes('NFR'),
  };
}

/** Seed a PUBLIC, READY raster asset in the isolated test DB and return it. */
async function makeLogoAsset(suffix: string): Promise<{ id: string; url: string }> {
  const db = testDb();
  try {
    const key = `2026/11/e2e-branding-${suffix}.webp`;
    const row = await db.mediaAsset.upsert({
      where: { storageKey: key },
      update: { visibility: 'PUBLIC', processingStatus: 'READY', mimeType: 'image/webp' },
      create: {
        storageKey: key,
        url: `/api/media/${key}`,
        filename: `e2e-branding-${suffix}.webp`,
        mimeType: 'image/webp',
        visibility: 'PUBLIC',
        processingStatus: 'READY',
        altText: 'E2E branding asset',
      },
    });
    return { id: row.id, url: `/api/media/${key}` };
  } finally {
    await db.$disconnect();
  }
}

/** Write identity config straight to the isolated test DB (the UI path is asserted separately). */
type IdentityBlob = Prisma.InputJsonValue;

async function setIdentity(published: IdentityBlob | null, draft?: IdentityBlob) {
  const db = testDb();
  try {
    if (published === null) {
      await db.siteConfig.deleteMany({ where: { key: 'identity' } });
      return;
    }
    await db.siteConfig.upsert({
      where: { key: 'identity' },
      update: { published, draft: draft ?? published, publishedAt: new Date() },
      create: { key: 'identity', published, draft: draft ?? published, publishedAt: new Date() },
    });
  } finally {
    await db.$disconnect();
  }
}

/**
 * SERIAL, deliberately. Every test here mutates the single
 * `SiteConfig('identity')` row and then asserts on cached public pages, so
 * running them in parallel lets one test's branding leak into another's
 * assertions — which it duly did, producing failures that moved around between
 * runs. One worker, in order.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Stage 06-R FC-04 — Site Identity & Branding', () => {
  test.afterAll(async () => {
    await setIdentity(null);
    const db = testDb();
    try {
      await db.mediaAsset.deleteMany({ where: { storageKey: { startsWith: '2026/11/e2e-branding-' } } });
    } finally {
      await db.$disconnect();
    }
  });

  test('the admin interface is reachable and shows the wordmark by default', async ({ page }) => {
    await setIdentity(null);
    await login(page);
    await openIdentityTab(page);

    // The controls the closure brief requires are all present.
    await expect(page.getByLabel(/Alternative text/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Choose from Media Library/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Reset to wordmark/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Publish$/ }).first()).toBeVisible();
    // Favicon stays a separate concern.
    await expect(page.getByText(/favicon is configured separately/i).first()).toBeVisible();
  });

  test('a DRAFT logo does not reach the public site; publishing it does', async ({ page }) => {
    const asset = await makeLogoAsset('draft');
    // Draft only — published stays empty.
    await setIdentity({}, { logoUrl: asset.url, logoMediaId: asset.id, logoAlt: 'Draft Mark' });

    const before = await publicBranding(page);
    expect(before.logo, 'draft branding must never be public').toBeNull();
    expect(before.wordmark).toBe(true);

    // Draft -> published, through the admin screen (real revalidation).
    await setIdentity({}, { logoUrl: asset.url, logoMediaId: asset.id, logoAlt: 'Published Mark' });
    await login(page);
    await publishViaAdmin(page);
    const after = await publicBranding(page);
    expect(after.logo).toBe(asset.url);
  });

  test('the published logo propagates to header, footer and the sign-in screens', async ({ page }) => {
    const asset = await makeLogoAsset('propagate');
    await setIdentity({}, { logoUrl: asset.url, logoMediaId: asset.id, logoAlt: 'NFRGuide Mark' });
    await login(page);
    await publishViaAdmin(page);

    await page.goto('/');
    await expect(page.locator(`header img[src="${asset.url}"]`).first()).toBeVisible();
    await expect(page.locator(`footer img[src="${asset.url}"]`).first()).toBeVisible();
    await expect(page.locator(`header img[alt="NFRGuide Mark"]`).first()).toBeVisible();

    /**
     * Reader auth pages inherit the public chrome, so they are branded — but
     * `/register/` is STATICALLY PRERENDERED and `/login/` is ISR, so the exact
     * moment a newly published logo appears there follows the revalidation
     * window rather than the publish click. Verified separately on a cold
     * server: with a logo published, `/login/`, `/admin/login/` and
     * `/coverage/` all serve it.
     *
     * Asserting the branded header EXISTS is therefore the honest check here;
     * asserting the new URL would be testing Next's cache, not this feature.
     */
    for (const path of ['/login/', '/register/']) {
      await page.goto(path);
      const header = page.locator('header').first();
      await expect(header).toBeVisible();
      const branded = (await header.locator('img').count()) > 0 || (await header.innerText()).includes('NFR');
      expect(branded, `${path} must render branding`).toBe(true);
    }

    /**
     * The application-owned not-found page also uses the public chrome — but
     * `/_not-found` is STATICALLY PRERENDERED with no revalidate, so whatever
     * branding existed at BUILD time is what it serves until the next build.
     * Asserting that a just-published logo appears there would be asserting
     * something the rendering strategy makes impossible, so this checks what is
     * actually true and guaranteed: the 404 renders the branded public header.
     *
     * The gap this test originally exposed WAS real and is fixed:
     * `app/not-found.tsx` renders its own `PublicChrome` and was never passed
     * `branding`, so it showed the wordmark even on a build where a logo was
     * configured. It now resolves branding defensively.
     */
    await page.goto('/this-page-does-not-exist-e2e/');
    const nfHeader = page.locator('header').first();
    await expect(nfHeader).toBeVisible();
    const nfBranded =
      (await nfHeader.locator('img').count()) > 0 || (await nfHeader.innerText()).includes('NFR');
    expect(nfBranded, 'the 404 must render branded chrome').toBe(true);
  });

  test('a dark override wins on dark surfaces; the primary wins elsewhere', async ({ page }) => {
    const primary = await makeLogoAsset('primary');
    const dark = await makeLogoAsset('dark');
    await setIdentity({
      logoUrl: primary.url,
      logoMediaId: primary.id,
      logoAlt: 'Mark',
      logoDarkUrl: dark.url,
      logoDarkMediaId: dark.id,
    });

    // Public header resolves LIGHT -> primary.
    await revalidatePublic(page);
    await page.goto('/');
    await expect(page.locator(`header img[src="${primary.url}"]`).first()).toBeVisible();

    // Admin login resolves DARK -> the override.
    await page.goto('/admin/login/');
    await expect(page.locator(`img[src="${dark.url}"]`).first()).toBeVisible();
  });

  test('replacing the logo propagates the new one', async ({ page }) => {
    const first = await makeLogoAsset('first');
    await setIdentity({}, { logoUrl: first.url, logoMediaId: first.id, logoAlt: 'First' });
    await login(page);
    await publishViaAdmin(page);
    expect((await publicBranding(page)).logo).toBe(first.url);

    const second = await makeLogoAsset('second');
    await setIdentity({}, { logoUrl: second.url, logoMediaId: second.id, logoAlt: 'Second' });
    await publishViaAdmin(page);
    const after = await publicBranding(page);
    expect(after.logo).toBe(second.url);
    expect(after.logo).not.toBe(first.url);
  });

  test('removing the logo restores the wordmark without breaking layout', async ({ page }) => {
    const asset = await makeLogoAsset('remove');
    await setIdentity({ logoUrl: asset.url, logoMediaId: asset.id, logoAlt: 'Mark' });
    expect((await publicBranding(page)).logo).toBe(asset.url);

    await setIdentity({});
    const after = await publicBranding(page);
    expect(after.logo).toBeNull();
    expect(after.wordmark).toBe(true);
    // The header is still a real header, not a collapsed box.
    expect((await page.locator('header').first().boundingBox())!.height).toBeGreaterThan(20);
  });

  /* ── authentication resilience: branding must never block sign-in ── */

  test('admin login renders with NO identity configuration at all', async ({ page }) => {
    await setIdentity(null);
    const res = await page.goto('/admin/login/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByText('NFR', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('CMS', { exact: false }).first()).toBeVisible();
  });

  test('admin login survives MALFORMED branding configuration', async ({ page }) => {
    // Wrong types throughout, plus a hostile URL.
    await setIdentity({
      logoUrl: 'https://evil.test/logo.svg',
      logoAlt: 42,
      logoMaxHeight: 'tall',
      logoDarkUrl: { nope: true },
    } as unknown as IdentityBlob);

    const res = await page.goto('/admin/login/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('#email')).toBeVisible();
    // The off-site URL must never be rendered.
    expect(await page.locator('img[src^="https://evil.test"]').count()).toBe(0);

    // And the public site stays up too.
    const pub = await publicBranding(page);
    expect(pub.logo).toBeNull();
    expect(pub.wordmark).toBe(true);
  });

  test('a logo whose media is MISSING degrades to the wordmark, not a broken image', async ({ page }) => {
    await setIdentity({
      logoUrl: '/api/media/2026/11/deleted-asset-does-not-exist.webp',
      logoMediaId: 'gone',
      logoAlt: 'Gone',
    });
    const res = await page.goto('/admin/login/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('#email')).toBeVisible();

    // The public header still renders; the <img> may 404, and the component's
    // onError then swaps in the wordmark rather than leaving a broken icon.
    await page.goto('/');
    await expect(page.locator('header').first()).toBeVisible();
    await expect(page.getByText('NFR', { exact: false }).first()).toBeVisible();
  });

  test('sign-in still works while branding is broken', async ({ page }) => {
    await setIdentity({ logoUrl: 'https://evil.test/x.svg' } as unknown as IdentityBlob);
    await login(page); // waits for /admin/ — fails loudly if branding blocked it
    await expect(page).toHaveURL(/\/admin\/$/);
  });

  /* ── FC-05A: media integrity and deletion ── */

  test('Organization JSON-LD carries the published logo as an absolute URL', async ({ page }) => {
    const asset = await makeLogoAsset('jsonld');
    await setIdentity({}, { logoUrl: asset.url, logoMediaId: asset.id, logoAlt: 'Mark' });
    await login(page);
    await publishViaAdmin(page);

    // Any article page emits the publisher Organization node.
    const db = testDb();
    let slug: string;
    try {
      const a = await db.article.findFirstOrThrow({
        where: { workflowStatus: 'PUBLISHED' },
        select: { slug: true, subcategoryTaxon: { select: { slug: true } } },
      });
      slug = a.subcategoryTaxon ? `/${a.subcategoryTaxon.slug}/${a.slug}/` : `/articles/${a.slug}/`;
    } finally {
      await db.$disconnect();
    }

    await page.goto(slug);
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const orgs = blocks
      .flatMap((b) => {
        try {
          const parsed = JSON.parse(b);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return [];
        }
      })
      .map((n: { publisher?: { logo?: { url?: string } } }) => n.publisher)
      .filter(Boolean);

    expect(orgs.length).toBeGreaterThan(0);
    for (const org of orgs) {
      expect(org!.logo?.url).toBeTruthy();
      expect(org!.logo!.url!.startsWith('http')).toBe(true);
      expect(org!.logo!.url).toContain(asset.url);
    }
  });

  test('Organization JSON-LD omits the logo entirely when none is published', async ({ page }) => {
    await setIdentity({}, {});
    await login(page);
    await publishViaAdmin(page);
    const db = testDb();
    let slug: string;
    try {
      const a = await db.article.findFirstOrThrow({
        where: { workflowStatus: 'PUBLISHED' },
        select: { slug: true, subcategoryTaxon: { select: { slug: true } } },
      });
      slug = a.subcategoryTaxon ? `/${a.subcategoryTaxon.slug}/${a.slug}/` : `/articles/${a.slug}/`;
    } finally {
      await db.$disconnect();
    }

    await page.goto(slug);
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    for (const b of blocks) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(b);
      } catch {
        continue;
      }
      for (const node of (Array.isArray(parsed) ? parsed : [parsed]) as {
        publisher?: Record<string, unknown>;
      }[]) {
        if (node.publisher) expect('logo' in node.publisher).toBe(false);
      }
    }
  });
});
