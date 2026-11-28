import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Actor } from '@/lib/cms/guard';

/**
 * A section landing page's hero photograph, chosen from the Media Library.
 *
 * THE GAP THIS CLOSES. The hero came from `SectionConfig.heroImage`, which only
 * ever reached the five foundational sections — an administrator-created
 * category had no way to give its landing page an image at all, and there was
 * no visual way to choose one: the value was a URL an operator had to know and
 * type, carrying no alt text and no rights record.
 *
 * These cases pin the three things that can silently regress: the write path's
 * three-state handling of `heroMediaId` (absent / null / id), the precedence
 * the landing page applies, and that the editor offers a library chooser rather
 * than a URL field.
 */

const prisma = new PrismaClient();
const RID = `cathero-${Date.now()}`;

let hasDb = true;
let categoryId = '';
let mediaA = '';
let mediaB = '';

/** A real User row: `audit()` writes an AuditLog whose actor is a foreign key. */
let actor: Actor = { id: '', roles: ['super_admin'] };

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    hasDb = false;
    return;
  }

  const media = async (slug: string, alt: string) =>
    prisma.mediaAsset.create({
      data: {
        storageKey: `${RID}/${slug}.webp`,
        url: `/api/media/${RID}/${slug}.webp`,
        filename: `${slug}.webp`,
        mimeType: 'image/webp',
        dimensions: '1600x900',
        height: 900,
        altText: alt,
        seoTitle: `${slug} hero`,
      },
      select: { id: true },
    });

  const user = await prisma.user.create({
    data: { email: `${RID}@example.com`, name: 'Category Hero Fixture', status: 'ACTIVE' },
    select: { id: true },
  });
  actor = { id: user.id, roles: ['super_admin'] };

  mediaA = (await media('a', 'A bronc rider mid-ride')).id;
  mediaB = (await media('b', '')).id;

  const c = await prisma.category.create({
    data: { slug: `${RID}-section`, name: `${RID} Section`, description: 'fixture', sortOrder: 90 },
    select: { id: true },
  });
  categoryId = c.id;
});

afterAll(async () => {
  if (hasDb) {
    await prisma.category.deleteMany({ where: { slug: { startsWith: 'cathero-' } } });
    await prisma.mediaAsset.deleteMany({ where: { storageKey: { startsWith: 'cathero-' } } });
    if (actor.id) {
      await prisma.auditLog.deleteMany({ where: { actorId: actor.id } });
      await prisma.user.deleteMany({ where: { id: actor.id } });
    }
  }
  await prisma.$disconnect();
});

describe('category hero — the write path', () => {
  it('an ABSENT heroMediaId leaves an existing hero alone', async () => {
    if (!hasDb) return;
    const { updateCategory, listCategories } = await import('@/lib/cms/taxonomyService');

    await updateCategory(actor, categoryId, { name: `${RID} Section`, heroMediaId: mediaA });
    // A rename that says nothing about the hero must not clear it — this is the
    // case a two-state (set / unset) field would get wrong.
    await updateCategory(actor, categoryId, { name: `${RID} Renamed` });

    const row = (await listCategories()).find((c) => c.id === categoryId)!;
    expect(row.name).toBe(`${RID} Renamed`);
    expect(row.heroMediaId).toBe(mediaA);
  });

  it('an explicit NULL removes the hero', async () => {
    if (!hasDb) return;
    const { updateCategory, listCategories } = await import('@/lib/cms/taxonomyService');

    await updateCategory(actor, categoryId, { name: `${RID} Renamed`, heroMediaId: mediaA });
    await updateCategory(actor, categoryId, { name: `${RID} Renamed`, heroMediaId: null });

    const row = (await listCategories()).find((c) => c.id === categoryId)!;
    expect(row.heroMediaId).toBeNull();
    expect(row.heroImageUrl).toBeNull();
  });

  it('resolves the URL and alt text, so the editor needs no second request', async () => {
    if (!hasDb) return;
    const { updateCategory, listCategories } = await import('@/lib/cms/taxonomyService');

    await updateCategory(actor, categoryId, { name: `${RID} Renamed`, heroMediaId: mediaA });
    const row = (await listCategories()).find((c) => c.id === categoryId)!;
    expect(row.heroImageUrl).toBe(`/api/media/${RID}/a.webp`);
    expect(row.heroImageAlt).toBe('A bronc rider mid-ride');
  });

  it('reports an asset that is no longer in the library, instead of a constraint name', async () => {
    if (!hasDb) return;
    const { updateCategory } = await import('@/lib/cms/taxonomyService');
    await expect(
      updateCategory(actor, categoryId, {
        name: `${RID} Renamed`,
        heroMediaId: '00000000-0000-4000-8000-000000000000',
      }),
    ).rejects.toThrow(/no longer in the Media Library/i);
  });

  it('deleting the asset empties the hero rather than stranding a dead reference', async () => {
    if (!hasDb) return;
    const { updateCategory, listCategories } = await import('@/lib/cms/taxonomyService');

    await updateCategory(actor, categoryId, { name: `${RID} Renamed`, heroMediaId: mediaB });
    await prisma.mediaAsset.delete({ where: { id: mediaB } });

    const row = (await listCategories()).find((c) => c.id === categoryId)!;
    // ON DELETE SET NULL — the id and the URL always agree, so the landing page
    // falls back to its plain header instead of requesting a missing file.
    expect(row.heroMediaId).toBeNull();
    expect(row.heroImageUrl).toBeNull();
  });
});

describe('category hero — the landing page', () => {
  const landing = () => readFileSync(resolve(process.cwd(), 'lib/cms/sectionLandingData.ts'), 'utf8');
  const blocks = () => readFileSync(resolve(process.cwd(), 'components/blocks/LandingBlocks.tsx'), 'utf8');

  it("prefers the CATEGORY's hero over the older settings field", () => {
    const src = landing();
    // The category's URL is first in the chain; settings remain the fallback, so
    // a section already configured there keeps working with no migration.
    expect(src).toMatch(/heroCategory\?\.heroMedia\?\.url\s*\?\?\s*sectionConfig\?\.heroImage\s*\?\?\s*null/);
  });

  it('matches the category by NAME, which is what `categoryKey` holds', () => {
    // `PRIMARY_SECTIONS[...].categoryKey` is 'NFR Competition', not a slug.
    // Matching on slug would silently find nothing and the hero would never show.
    expect(landing()).toMatch(/where:\s*\{\s*name:\s*sectionMeta\.categoryKey\s*\}/);
  });

  it('carries the asset alt text to the hero', () => {
    expect(landing()).toContain('sectionHeroImageAlt');
    expect(blocks()).toMatch(/backgroundImageAlt=\{/);
  });

  it('keeps the Builder property winning over both', () => {
    // Stage 02 (H-04) precedence must not be reordered by this change.
    expect(blocks()).toMatch(/backgroundImageUrl=\{p\('heroImageUrl'\)\s*\|\|\s*d\.sectionHeroImage/);
  });
});

describe('category hero — the editor', () => {
  const page = () => readFileSync(resolve(process.cwd(), 'views/admin/AdminEditorialOrgPage.tsx'), 'utf8');

  it('offers a Media Library chooser, not a URL text field', () => {
    const src = page();
    expect(src).toContain('MediaPickerModal');
    expect(src).toContain('Choose from Media Library');
    // A hero typed as a URL carries no rights record and no alt text, which is
    // the reason the picker exists at all.
    expect(src).not.toMatch(/heroImageUrl.*<input[^>]*type="text"/s);
  });

  it('refuses a pasted custom URL, because the hero is a foreign key', () => {
    expect(page()).toMatch(/if \(!media\.id\)/);
  });

  it('sends the id and never the display URL', () => {
    const src = page();
    expect(src).toMatch(/heroMediaId:\s*catForm\.heroMediaId\s*\|\|\s*null/);
    // `heroImageUrl` is display state; the server resolves it from the id, and
    // sending both would let the two disagree.
    expect(src).not.toMatch(/heroImageUrl:\s*catForm\.heroImageUrl,?\s*\n\s*\};/);
  });

  it('can clear a hero that was set', () => {
    expect(page()).toMatch(/heroMediaId:\s*''\s*,\s*heroImageUrl:\s*''/);
  });
});
