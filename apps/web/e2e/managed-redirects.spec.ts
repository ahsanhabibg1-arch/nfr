import { expect, test } from '@playwright/test';
import http from 'node:http';
import { readState, testDb } from './support';

const db = testDb();
const run = readState().runId;
const target = '/competition/';
const sources = new Map([301, 302, 307, 308].map((code) => [code, `/articles/e2e-managed-${code}-${run}/`]));
const uiSource = `/articles/e2e-ui-${run}/`;
const csvSource = `/articles/e2e-csv-${run}/`;

test.afterAll(async () => {
  const sourcePaths = [...sources.values(), uiSource, csvSource];
  const rows = await db.articleRedirect.findMany({ where: { sourcePath: { in: sourcePaths } }, select: { id: true } });
  await db.auditLog.deleteMany({
    where: {
      entityType: 'redirect',
      OR: [
        { entityId: { in: rows.map((row) => row.id) } },
        { actorId: readState().adminUserId, action: 'redirect.csv.import' },
      ],
    },
  });
  await db.articleRedirect.deleteMany({ where: { sourcePath: { in: sourcePaths } } });
  await db.$disconnect();
});

function raw(path: string, method = 'GET'): Promise<{ status: number; rawHeaders: string[] }> {
  const base = new URL(process.env.E2E_BASE_URL || 'http://localhost:3100');
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: base.hostname, port: base.port, path, method }, (res) => {
      res.resume(); res.on('end', () => resolve({ status: res.statusCode || 0, rawHeaders: res.rawHeaders }));
    });
    req.on('error', reject); req.end();
  });
}

test.describe('managed redirect HTTP response boundary', () => {
  test('admin-created rules deliver exact statuses and refresh negative snapshot entries', async ({ page }) => {
    await login(page);
    await page.goto('/admin/seo/redirects/');
    let cacheVersion = (await db.redirectCacheState.findUniqueOrThrow({ where: { id: 1 }, select: { version: true } })).version;
    for (const code of [301, 302, 307, 308] as const) {
      const sourcePath = sources.get(code)!;
      expect((await raw(sourcePath)).status).toBe(404);
      await page.getByRole('button', { name: 'Create redirect' }).click();
      await page.locator('#redirect-source').fill(sourcePath);
      await page.locator('#redirect-target').fill(target);
      await page.locator('#redirect-code').selectOption(String(code));
      await page.locator('#redirect-state').selectOption('ACTIVE');
      await page.locator('#redirect-note').fill(`E2E ${code}`);
      await page.getByRole('button', { name: 'Save redirect' }).click();
      await expect(page.getByRole('status')).toContainText('Redirect created');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const saved = await db.articleRedirect.findUnique({ where: { sourcePath }, select: { status: true, statusCode: true } });
      expect(saved).toEqual({ status: 'ACTIVE', statusCode: code });
      const nextVersion = (await db.redirectCacheState.findUniqueOrThrow({ where: { id: 1 }, select: { version: true } })).version;
      expect(nextVersion).toBeGreaterThan(cacheVersion);
      cacheVersion = nextVersion;
      const result = await raw(`${sourcePath}?utm_source=e2e&utm_campaign=nfr&token=secret&next=https%3A%2F%2Fevil.test`);
      expect(result.status, JSON.stringify(result.rawHeaders)).toBe(code);
      const locationIndexes = result.rawHeaders.map((x) => x.toLowerCase()).flatMap((x, i) => x === 'location' ? [i] : []);
      expect(locationIndexes).toHaveLength(1);
      const location = result.rawHeaders[locationIndexes[0] + 1];
      expect(location).toContain('utm_source=e2e');
      expect(location).toContain('utm_campaign=nfr');
      expect(location).not.toContain('token=');
      expect(location).not.toContain('next=');
    }
  });

  test('does not intercept unrelated POST requests', async () => {
    expect((await raw(`/articles/e2e-unmanaged-${run}/`, 'POST')).status).not.toBe(307);
  });
});

async function login(page: import('@playwright/test').Page) {
  const state = readState();
  await page.goto('/admin/login/');
  await page.locator('#email').fill(state.adminEmail);
  await page.locator('#password').fill(state.adminPassword);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/admin\/$/, { timeout: 15_000 });
}

test.describe('URL Redirects Engine admin UI', () => {
  test('navigation, metrics, filters, create/edit/state, diagnostics and audit are functional', async ({ page }) => {
    await login(page);
    await page.getByRole('link', { name: 'URL Redirects Engine' }).click();
    await expect(page.getByRole('heading', { name: 'URL Redirects Engine' })).toBeVisible();
    await expect(page.getByText('Total', { exact: true })).toBeVisible();

    // Prime the real proxy snapshot with a negative lookup before creating this rule.
    expect((await raw(uiSource)).status).toBe(404);
    await page.getByRole('button', { name: 'Create redirect' }).click();
    await page.locator('#redirect-source').fill(uiSource);
    await page.locator('#redirect-target').fill('https://outside.example/');
    await page.locator('#redirect-code').selectOption('302');
    await page.getByRole('button', { name: 'Save redirect' }).click();
    await expect(page.locator('#redirect-target-error')).toContainText('Invalid destination');

    await page.locator('#redirect-target').fill(target);
    await page.locator('#redirect-code').selectOption('302');
    await page.locator('#redirect-state').selectOption('DISABLED');
    await page.locator('#redirect-note').fill('E2E manual rule');
    await page.getByRole('button', { name: 'Save redirect' }).click();
    await expect(page.getByRole('status')).toContainText('Redirect created');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await raw(uiSource)).status).toBe(404);

    await page.getByRole('searchbox', { name: 'Search redirects' }).fill(`e2e-ui-${run}`);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText(uiSource, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.locator('#redirect-code').selectOption('307');
    await page.getByRole('button', { name: 'Save redirect' }).click();
    await expect(page.getByRole('status')).toContainText('Redirect updated');
    await expect(page.getByRole('cell', { name: '307', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByRole('status')).toContainText('activated');
    await expect(page.getByRole('button', { name: 'Deactivate' })).toBeVisible();
    const firstActivation = await raw(`${uiSource}?utm_source=ui&token=must-not-pass`);
    expect(firstActivation.status, JSON.stringify(firstActivation.rawHeaders)).toBe(307);
    await page.getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByRole('status')).toContainText('deactivated');
    await expect(page.getByRole('button', { name: 'Activate' })).toBeVisible();
    expect((await raw(uiSource)).status).toBe(404);
    await page.getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByRole('status')).toContainText('activated');
    await expect(page.getByRole('button', { name: 'Deactivate' })).toBeVisible();
    const activeAgain = await db.articleRedirect.findUnique({ where: { sourcePath: uiSource }, select: { status: true, statusCode: true } });
    expect(activeAgain).toEqual({ status: 'ACTIVE', statusCode: 307 });
    const secondActivation = await raw(uiSource);
    expect(secondActivation.status, JSON.stringify(secondActivation.rawHeaders)).toBe(307);

    await page.getByRole('button', { name: 'Details', exact: true }).click();
    const detailDialog = page.getByRole('dialog', { name: 'Redirect details' });
    await expect(detailDialog).toContainText('E2E manual rule');
    await detailDialog.getByRole('button', { name: 'Close', exact: true }).click();

    await page.getByRole('button', { name: 'Diagnostics', exact: true }).first().click();
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByRole('button', { name: /Audit history/ }).click();
    await expect(page.getByText(/redirect\.(create|edit|activate)/).first()).toBeVisible();
  });

  test('CSV controls and mobile layout remain usable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.goto('/admin/seo/redirects/');
    await page.getByRole('button', { name: 'CSV import/export' }).click();
    await expect(page.getByRole('button', { name: 'Export filtered CSV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download sample' })).toBeVisible();
    expect(await page.locator('body').evaluate((el) => el.scrollWidth <= window.innerWidth + 1)).toBe(true);

    const csv = `sourcePath,targetPath,statusCode,status,note\r\n${csvSource},${target},302,DISABLED,CSV test\r\n`;
    await page.getByLabel('Choose redirects CSV').setInputFiles({
      name: 'redirects.csv', mimeType: 'text/csv', buffer: Buffer.from(csv),
    });
    await page.getByRole('button', { name: 'Run dry validation' }).click();
    await expect(page.getByText('1 valid / 0 invalid')).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Confirm import' }).click();
    await expect(page.getByRole('status')).toContainText('1 redirects imported');

    const invalidCsv = `sourcePath,targetPath,statusCode,status,note\r\n/articles/e2e-invalid-${run}/,https://outside.example/,301,DISABLED,Invalid\r\n`;
    await page.getByLabel('Choose redirects CSV').setInputFiles({
      name: 'invalid-redirects.csv', mimeType: 'text/csv', buffer: Buffer.from(invalidCsv),
    });
    await page.getByRole('button', { name: 'Run dry validation' }).click();
    await expect(page.getByText('0 valid / 1 invalid')).toBeVisible();
  });
});
