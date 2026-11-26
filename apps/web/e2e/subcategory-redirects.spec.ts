import { test, expect } from '@playwright/test';
import { testDb } from './support';

/**
 * Stage 03 defect D-1, over real HTTP.
 *
 * The service-level cases in `tests/redirects-subcategory-and-security.test.ts`
 * prove the resolver returns the right answer. They cannot prove the ROUTE asks
 * it the right question — and asking the wrong question was the entire defect:
 * the route passed a bare slug, so the resolver looked under `/articles/...`
 * and a subcategory article's old URL 404'd with a valid 308 sitting unused in
 * the table.
 *
 * So these assert the wire: the status code a crawler receives and the
 * `Location` header it follows. A database row assertion would have passed
 * throughout the entire period the bug existed.
 *
 * `redirect: 'manual'` is essential. Letting Playwright follow the hop would
 * turn a 308 and a 200 into the same green test.
 *
 * ON THE DUPLICATED `Location` HEADER. Every Server Component `redirect()` in
 * this Next 16.4.5 application emits `Location` TWICE with the same value —
 * measured on the pre-existing flat-article redirect and the pre-existing
 * canonical-enforcement redirect, both untouched by Stage 03, while the
 * framework-level `next.config.mjs` redirects emit it once. It is therefore a
 * pre-existing framework behaviour, not something this work introduced, and it
 * is reported rather than worked around.
 *
 * `locations()` below reads the raw header list and the assertions require
 * EVERY value to be the expected path. That is stronger than reading the first
 * one: if the duplicate ever diverges, these fail.
 */

/** Every `Location` value on the response, in order. */
function locations(res: { headersArray(): { name: string; value: string }[] }): string[] {
  return res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'location')
    .map((h) => h.value);
}

const TAG = 's03e2e';
const rid = () => Math.random().toString(36).slice(2, 8);

test.describe('subcategory article redirects (D-1)', () => {
  const subSlug = `${TAG}-sub-${rid()}`;
  const oldSlug = `${TAG}-old-${rid()}`;
  const newSlug = `${TAG}-new-${rid()}`;
  let seeded = false;

  test.beforeAll(async () => {
    const db = testDb();
    try {
      const cat = await db.category.findFirst({ select: { id: true } });
      const author = await db.author.findFirst({ select: { id: true } });
      if (!cat || !author) return;

      const sub = await db.subcategory.create({
        data: { categoryId: cat.id, name: `Stage3 ${rid()}`, slug: subSlug },
        select: { id: true },
      });

      /*
        The article is created ALREADY RENAMED, with the redirect row the
        service would have written. What is under test is the read path: the
        write path's correctness is covered by the service suite, and seeding
        directly keeps this spec independent of the editor UI.
      */
      await db.article.create({
        data: {
          slug: newSlug,
          title: 'Stage Three Subcategory Redirect Target',
          excerpt: 'Seeded by the Stage 03 redirect spec.',
          categoryId: cat.id,
          subcategoryId: sub.id,
          authorId: author.id,
          articleType: 'guide',
          workflowStatus: 'PUBLISHED',
          publishedAt: new Date(),
          imageRightsStatus: 'STAFF_PHOTO',
        },
      });

      await db.articleRedirect.create({
        data: { sourcePath: `/${subSlug}/${oldSlug}/`, targetPath: `/${subSlug}/${newSlug}/`, statusCode: 308 },
      });
      seeded = true;
    } finally {
      await db.$disconnect();
    }
  });

  test.afterAll(async () => {
    const db = testDb();
    try {
      await db.articleRedirect.deleteMany({ where: { sourcePath: { contains: TAG } } });
      await db.article.deleteMany({ where: { slug: { startsWith: `${TAG}-` } } });
      await db.subcategory.deleteMany({ where: { slug: { startsWith: `${TAG}-sub-` } } });
    } finally {
      await db.$disconnect();
    }
  });

  test('the old subcategory URL answers 308 and points at the new one', async ({ page }) => {
    test.skip(!seeded, 'no category/author fixture in this database');

    const res = await page.request.get(`/${subSlug}/${oldSlug}/`, { maxRedirects: 0 });

    expect(res.status(), 'a renamed subcategory article must redirect, not 404').toBe(308);

    const values = locations(res);
    expect(values.length, 'Location header must be present').toBeGreaterThan(0);
    for (const v of values) {
      expect(new URL(v, 'http://localhost').pathname, `Location value ${v}`).toBe(`/${subSlug}/${newSlug}/`);
    }
  });

  test('the destination itself answers 200', async ({ page }) => {
    test.skip(!seeded, 'no category/author fixture in this database');
    const res = await page.request.get(`/${subSlug}/${newSlug}/`, { maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });

  test('one hop, not two — the redirect lands directly on a 200', async ({ page }) => {
    test.skip(!seeded, 'no category/author fixture in this database');

    const first = await page.request.get(`/${subSlug}/${oldSlug}/`, { maxRedirects: 0 });
    expect(first.status()).toBe(308);
    const next = new URL(locations(first)[0], 'http://localhost').pathname;

    const second = await page.request.get(next, { maxRedirects: 0 });
    expect(second.status(), 'the destination must not itself redirect').toBe(200);
  });

  test('an unknown subcategory URL with no redirect still 404s', async ({ page }) => {
    test.skip(!seeded, 'no category/author fixture in this database');
    const res = await page.request.get(`/${subSlug}/${TAG}-absent-${rid()}/`, { maxRedirects: 0 });
    expect(res.status(), 'link rot must not become a soft 200 or a homepage bounce').toBe(404);
  });

  test('a redirect to a non-existent destination 404s rather than redirecting', async ({ page }) => {
    test.skip(!seeded, 'no category/author fixture in this database');
    const db = testDb();
    const src = `/${subSlug}/${TAG}-dangling-${rid()}/`;
    try {
      await db.articleRedirect.create({
        data: { sourcePath: src, targetPath: `/${subSlug}/${TAG}-nowhere-${rid()}/`, statusCode: 308 },
      });
    } finally {
      await db.$disconnect();
    }
    const res = await page.request.get(src, { maxRedirects: 0 });
    expect(res.status(), 'a dangling redirect must fall through to notFound()').toBe(404);
  });

  test('a redirect with an off-site destination is refused', async ({ page }) => {
    test.skip(!seeded, 'no category/author fixture in this database');
    const db = testDb();
    const src = `/${subSlug}/${TAG}-ext-${rid()}/`;
    try {
      await db.articleRedirect.create({ data: { sourcePath: src, targetPath: 'https://evil.example/', statusCode: 308 } });
    } finally {
      await db.$disconnect();
    }
    const res = await page.request.get(src, { maxRedirects: 0 });
    expect(res.status(), 'an off-site target must never be honoured').toBe(404);
    expect(locations(res).join(' ')).not.toContain('evil.example');
  });
});
