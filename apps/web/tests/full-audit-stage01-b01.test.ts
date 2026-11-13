import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { mergeSeoMeta } from '../lib/cms/entitySeoService';
import { robotsToString, INDEX_FOLLOW, LEGACY_NOINDEX, EDITOR_NOINDEX } from '../lib/seo/robots';
import { isIndexableHost } from '../lib/seo/productionHosts';

/**
 * Stage 01 — B-01: a category slug that names nothing must not be indexable.
 *
 * THE DEFECT. `app/(public)/categories/[slug]/page.tsx` passed
 * `derivedNoindex: false` unconditionally, so `/categories/<anything>/`
 * answered HTTP 200 with `index, follow` and a title built from the slug —
 * an unlimited supply of thin, indexable soft-404s, on a site whose whole
 * stabilisation programme has been about indexing safety.
 *
 * WHAT "KNOWN" MEANS, and why both halves matter: a canonical section from
 * `config/routes.ts`, OR a managed `Category` row that is not a canonical
 * section. `tests/seo-routes.test.ts` fixes the second case as `other-cat` and
 * expects it to stay indexable, so a fix that keyed only on the canonical five
 * would have broken a legitimate archive. These tests pin both directions.
 *
 * The HTTP status stays 200, matching every other unknown-entity route.
 */

// ---------------------------------------------------------------------------
// Pure: the metadata composition the route depends on.
// ---------------------------------------------------------------------------

describe('Stage 01 (pure) — derivedNoindex composes the intended policy', () => {
  const base = { title: 'T', description: 'D', path: '/categories/x/' };

  it('(1) an unknown category resolves to noindex, nofollow', () => {
    const meta = mergeSeoMeta(null, { ...base, derivedNoindex: true });
    expect(robotsToString(meta.robots!)).toBe('noindex, nofollow');
    expect(meta.robots).toEqual(LEGACY_NOINDEX);
  });

  it('(2) a known category stays index, follow', () => {
    const meta = mergeSeoMeta(null, { ...base, derivedNoindex: false });
    expect(robotsToString(meta.robots!)).toBe('index, follow');
    expect(meta.robots).toEqual(INDEX_FOLLOW);
  });

  it('(3) a stored editor noindex still applies to a KNOWN category', () => {
    const seo = { noindex: true } as Parameters<typeof mergeSeoMeta>[0];
    const meta = mergeSeoMeta(seo, { ...base, derivedNoindex: false });
    expect(robotsToString(meta.robots!)).toBe('noindex, follow');
    expect(meta.robots).toEqual(EDITOR_NOINDEX);
  });

  it('(3) editor noindex and unknown-category noindex combine to the most restrictive', () => {
    const seo = { noindex: true } as Parameters<typeof mergeSeoMeta>[0];
    const meta = mergeSeoMeta(seo, { ...base, derivedNoindex: true });
    expect(robotsToString(meta.robots!)).toBe('noindex, nofollow');
  });

  it('(3) stored SEO overrides (title, description, canonical) survive the change', () => {
    const seo = {
      noindex: false,
      seoTitle: 'Stored Title',
      metaDescription: 'Stored description.',
      canonicalOverride: null,
      ogImage: null,
    } as unknown as Parameters<typeof mergeSeoMeta>[0];
    const meta = mergeSeoMeta(seo, { ...base, derivedNoindex: false });
    expect(meta.title).toBe('Stored Title');
    expect(meta.description).toBe('Stored description.');
    expect(robotsToString(meta.robots!)).toBe('index, follow');
  });

  it('(4) non-production hostname protection is untouched by this change', () => {
    // IDX-02 adds `X-Robots-Tag: noindex, nofollow` in middleware for any host
    // that is not production. That is a separate layer and must keep working —
    // it is also why B-01 was only visible with a production Host header.
    expect(isIndexableHost('nfrguide.com')).toBe(true);
    expect(isIndexableHost('www.nfrguide.com')).toBe(true);
    expect(isIndexableHost('nfr-qadd.onrender.com')).toBe(false);
    expect(isIndexableHost('localhost:3000')).toBe(false);
    expect(isIndexableHost(null)).toBe(false);
  });

  it('(6) the fix is confined to the category route — no shared helper changed', async () => {
    // The sibling unknown-entity policies are untouched.
    const { UNAVAILABLE_ARTICLE_ROBOTS, directoryListingRobots } = await import('../lib/seo/robots');
    expect(robotsToString(UNAVAILABLE_ARTICLE_ROBOTS)).toBe('noindex, follow');
    expect(robotsToString(directoryListingRobots(true))).toBe('noindex, follow');
    expect(robotsToString(directoryListingRobots(false))).toBe('index, follow');
  });
});

// ---------------------------------------------------------------------------
// Source-level: the route actually applies the condition.
// ---------------------------------------------------------------------------

describe('Stage 01 (route) — the category page derives noindex from "is it known"', () => {
  /**
   * UPDATED BY STAGE 02. The behaviour this guards is unchanged and is covered
   * by the database-backed cases below; what moved is where "is this slug
   * known" is computed. Stage 01 derived it inline as `!meta && !catRow`;
   * Stage 02 (H-03) moved that question into the shared, database-aware
   * `resolveCategoryArchive`, which answers it as `known`.
   *
   * So the assertion no longer pins one expression. It pins the two things that
   * actually matter: the flag is not a hardcoded `false`, and it is derived
   * from a resolved notion of "unknown".
   */
  it('derivedNoindex is derived, never the literal false', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/(public)/categories/[slug]/page.tsx', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/derivedNoindex:\s*false/);
    expect(code).toMatch(/const unknownCategory = !/);
    expect(code).toMatch(/derivedNoindex:\s*unknownCategory/);
  });

  it('the page still returns 200 for an unknown slug — no notFound() was introduced', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/(public)/categories/[slug]/page.tsx', 'utf8');
    expect(src).not.toContain('notFound(');
  });
});

// ---------------------------------------------------------------------------
// Database-backed: generateMetadata against real rows.
// ---------------------------------------------------------------------------

let available = false;
let prisma: PrismaClient;
let page: { generateMetadata: (a: { params: Promise<{ slug: string }> }) => Promise<{ robots?: unknown }> };

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    page = (await import('../app/(public)/categories/[slug]/page')) as unknown as typeof page;
    available = true;
  } catch {
    available = false;
  }
}
const suite = available ? describe : describe.skip;

const robotsOf = (m: { robots?: unknown }): string => {
  const r = m.robots as { index?: boolean; follow?: boolean } | undefined;
  if (!r) return '<none>';
  return `${r.index ? 'index' : 'noindex'}, ${r.follow ? 'follow' : 'nofollow'}`;
};

suite('Stage 01 (db) — generateMetadata for known and unknown category slugs', () => {
  const createdCategoryIds: string[] = [];
  const rid = () => Math.random().toString(36).slice(2, 8);
  let managedOnlySlug: string;
  let canonicalSlug: string;

  beforeAll(async () => {
    // A canonical section that also has a Category row — the normal case.
    const canonical = await prisma.category.findFirstOrThrow({
      where: { slug: 'nfr-competition' }, select: { slug: true },
    });
    canonicalSlug = canonical.slug;

    // A managed category that is NOT one of the five canonical sections.
    // This is the `other-cat` case pinned by tests/seo-routes.test.ts.
    managedOnlySlug = `stage01-managed-${rid()}`;
    const row = await prisma.category.create({
      data: { slug: managedOnlySlug, name: `Stage01 Managed ${rid()}`, sortOrder: 900 },
      select: { id: true },
    });
    createdCategoryIds.push(row.id);
  });

  afterAll(async () => {
    if (!available) return;
    await prisma.entitySeo.deleteMany({ where: { entityType: 'CATEGORY', entityId: { in: createdCategoryIds } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  });

  it('(1) an UNKNOWN slug is not indexable', async () => {
    const meta = await page.generateMetadata({ params: Promise.resolve({ slug: `no-such-category-${rid()}` }) });
    expect(robotsOf(meta)).toBe('noindex, nofollow');
  });

  it('(1) several unknown shapes are all refused indexing', async () => {
    for (const slug of ['made-up', 'x', 'nfr-competition-typo', 'categories', 'admin']) {
      const meta = await page.generateMetadata({ params: Promise.resolve({ slug }) });
      expect(robotsOf(meta), slug).toBe('noindex, nofollow');
    }
  });

  it('(2) a canonical section remains indexable', async () => {
    const meta = await page.generateMetadata({ params: Promise.resolve({ slug: canonicalSlug }) });
    expect(robotsOf(meta)).toBe('index, follow');
  });

  it('(2) a MANAGED, non-canonical category remains indexable — the other-cat case', async () => {
    const meta = await page.generateMetadata({ params: Promise.resolve({ slug: managedOnlySlug }) });
    expect(robotsOf(meta)).toBe('index, follow');
  });

  it('(3) an editor noindex on a managed category is still respected', async () => {
    const cat = await prisma.category.findUniqueOrThrow({ where: { slug: managedOnlySlug }, select: { id: true } });
    await prisma.entitySeo.create({
      data: { entityType: 'CATEGORY', entityId: cat.id, noindex: true },
    });
    try {
      const meta = await page.generateMetadata({ params: Promise.resolve({ slug: managedOnlySlug }) });
      expect(robotsOf(meta)).toBe('noindex, follow');
    } finally {
      await prisma.entitySeo.deleteMany({ where: { entityType: 'CATEGORY', entityId: cat.id } });
    }
  });

  it('every canonical section archive stays indexable', async () => {
    const { PRIMARY_SECTIONS } = await import('../config/routes');
    for (const meta of Object.values(PRIMARY_SECTIONS)) {
      const slug = meta.categoryKey.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const m = await page.generateMetadata({ params: Promise.resolve({ slug }) });
      expect(robotsOf(m), slug).toBe('index, follow');
    }
  });

  it('(5) the sitemap still lists exactly the five canonical category archives', async () => {
    const { buildSitemapEntries } = await import('../lib/seo/sitemapEntries');
    const entries = await buildSitemapEntries();
    const categoryUrls = entries
      .map((e: { url: string }) => e.url)
      .filter((u: string) => u.includes('/categories/'))
      .sort();
    expect(categoryUrls).toHaveLength(5);
    // The category created by this suite must NOT have entered the sitemap.
    expect(categoryUrls.some((u: string) => u.includes(managedOnlySlug))).toBe(false);
  });
});
