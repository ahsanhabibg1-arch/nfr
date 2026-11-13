import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * `AdminArticleEditorShell` is a client component that calls `useRouter` and
 * `useParams`, which throw outside an app-router context. Only those hooks are
 * replaced — the component, the category list and the rendered markup are all
 * real. Same stub as `tests/issue04a-article-types.test.ts`.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/articles/new/',
}));
import type { PrismaClient } from '@prisma/client';
import type { Actor } from '../lib/cms/guard';
import type { RoleKey } from '../lib/auth/rbac';
import type * as TaxSvc from '../lib/cms/taxonomyService';
import type * as ArticleSvc from '../lib/cms/articleService';
import type * as Content from '../lib/content';

/**
 * Stage 02 — administrator-managed Categories (H-01, H-02, H-03, H-04).
 *
 * The question this stage answers is narrow and testable: can an authorized
 * administrator create a sixth Category and USE it — assign an article, save,
 * reload, publish, and have the public archive resolve — without a developer
 * touching source code?
 *
 * The server could already do most of it: `resolveCategoryId` has always looked
 * the category up by name in the database. What blocked it was the editor's
 * compiled-in list of five, a `PrimarySection` union that made a sixth category
 * a type error, a breadcrumb that fell back to `/competition/`, and a category
 * archive that read its identity from `config/routes.ts` alone.
 *
 * The five foundational sections must come through untouched, so most of what
 * follows checks that nothing moved rather than that something new appeared.
 */

let available = false;
let prisma: PrismaClient;
let tax: typeof TaxSvc;
let article: typeof ArticleSvc;
let content: typeof Content;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    tax = await import('../lib/cms/taxonomyService');
    article = await import('../lib/cms/articleService');
    content = await import('../lib/content');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
    available = true;
  } catch {
    available = false;
  }
}
const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

/** HTML-escape, so an `&` in a section name matches the rendered markup. */
const esc = (s: string): string => s.replace(/&/g, '&amp;');

const FOUNDATIONAL = [
  'NFR Competition', 'NFR Entertainment', 'NFR Events & Shopping',
  'NFR Plan & Watch', 'More Rodeo',
];

// ===========================================================================
// Pure — the editor no longer restricts sections, and the five survive.
// ===========================================================================

describe('Stage 02 (pure) — H-01: the editor renders managed categories', () => {
  const base = {
    permissions: {
      canSubmit: true, canReview: true, canApprove: true, canPublish: true,
      canSchedule: true, canDelete: true, canEditAny: true,
    },
    actorName: 'Tester',
  };

  async function renderShell(props: Record<string, unknown>): Promise<string> {
    const { AdminArticleEditorShell } = await import('../views/admin/AdminArticleEditorShell');
    return renderToStaticMarkup(
      React.createElement(AdminArticleEditorShell, { ...base, ...props } as never),
    );
  }

  it('a managed sixth category appears as an option', async () => {
    const html = await renderShell({
      categories: [
        ...FOUNDATIONAL.map((n, i) => ({ id: `c${i}`, name: n, slug: `s${i}` })),
        { id: 'c9', name: 'Western Lifestyle', slug: 'western-lifestyle' },
      ],
    });
    expect(html).toContain('Western Lifestyle');
    // `renderToStaticMarkup` escapes `&`, so compare against the rendered form.
    for (const n of FOUNDATIONAL) expect(html, n).toContain(esc(n));
  });

  it('with no categories prop it falls back to the five foundational names', async () => {
    const html = await renderShell({});
    for (const n of FOUNDATIONAL) expect(html, n).toContain(esc(n));
  });

  it("an article's current category is offered even when it is no longer listed", async () => {
    const html = await renderShell({
      categories: [{ id: 'c0', name: 'NFR Competition', slug: 'nfr-competition' }],
      initialArticle: {
        id: 'a1', slug: 's', title: 'T', deck: '', excerpt: 'E', content: [],
        category: 'Retired Section', readTime: '3 min read', author: { name: 'A', role: 'R' },
      },
    });
    expect(html).toContain('Retired Section');
  });

  it('the compiled-in list is a FALLBACK, not the dropdown source', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('views/admin/AdminArticleEditorShell.tsx', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).toMatch(/sectionOptions\.map/);
    expect(code).not.toMatch(/\{PRIMARY_SECTIONS\.map/);
    expect(code).toMatch(/const FALLBACK_SECTIONS/);
  });

  it('Article.category is no longer a closed union', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('types/index.ts', 'utf8');
    expect(src).toMatch(/category:\s*string;/);
    // …but the foundational vocabulary is still exported for code that means those five.
    expect(src).toMatch(/export type PrimarySection/);
  });
});

describe('Stage 02 (pure) — H-04: Builder-first hero precedence', () => {
  it('a Builder hero image wins over the SectionConfig value', async () => {
    const { LandingHeroBlock } = await import('../components/blocks/LandingBlocks');
    const html = renderToStaticMarkup(
      React.createElement(LandingHeroBlock, {
        slot: { id: 's', sectionType: 'landing-hero', props: { heroImageUrl: 'https://cdn.example/builder.jpg' } },
        data: {
          sectionMeta: { name: 'N', tagline: 'T', description: 'D', path: '/x/' },
          sectionHeroImage: 'https://cdn.example/settings.jpg',
        },
      } as never),
    );
    expect(html).toContain('builder.jpg');
    expect(html).not.toContain('settings.jpg');
  });

  it('the SectionConfig image applies only when the Builder property is empty', async () => {
    const { LandingHeroBlock } = await import('../components/blocks/LandingBlocks');
    const html = renderToStaticMarkup(
      React.createElement(LandingHeroBlock, {
        slot: { id: 's', sectionType: 'landing-hero', props: { heroImageUrl: '' } },
        data: {
          sectionMeta: { name: 'N', tagline: 'T', description: 'D', path: '/x/' },
          sectionHeroImage: 'https://cdn.example/settings.jpg',
        },
      } as never),
    );
    expect(html).toContain('settings.jpg');
  });

  it('with neither configured the hero renders exactly as before — no image', async () => {
    const { LandingHeroBlock } = await import('../components/blocks/LandingBlocks');
    const html = renderToStaticMarkup(
      React.createElement(LandingHeroBlock, {
        slot: { id: 's', sectionType: 'landing-hero', props: {} },
        data: { sectionMeta: { name: 'N', tagline: 'T', description: 'D', path: '/x/' } },
      } as never),
    );
    expect(html).not.toContain('<img');
  });
});

// ===========================================================================
// Database-backed.
// ===========================================================================

suite('Stage 02 (db) — a sixth Category end to end', () => {
  const users: string[] = [];
  const slugs: string[] = [];
  const categoryIds: string[] = [];
  const subcategoryIds: string[] = [];
  let admin: Actor;
  let editor: Actor;
  let author: Actor;
  let newCategory: { id: string; name: string; slug: string };

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({
      data: { email: `s02-${roleKey}-${rid()}@example.com`, name: `S02 ${roleKey}`, status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    users.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }

  function input(over: Partial<ArticleSvc.ArticleInput> = {}): ArticleSvc.ArticleInput {
    const slug = `s02-${rid()}`;
    slugs.push(slug);
    return {
      slug, title: 'A Stage 02 Headline',
      excerpt: 'An editorial excerpt long enough to satisfy the publication gate for this test case.',
      blocks: [
        { type: 'paragraph', text: 'An opening paragraph with enough words to pass the publication gate checks.' },
        { type: 'heading', level: 2, text: 'Section' },
      ],
      categoryName: 'NFR Competition', authorName: 'S02 Tester', articleType: 'General Information',
      imageRightsStatus: 'Staff Photo',
      imageAltText: 'A descriptive alt text for the featured test photograph.',
      ...over,
    } as ArticleSvc.ArticleInput;
  }

  beforeAll(async () => {
    admin = await makeUser('administrator');
    editor = await makeUser('editor');
    author = await makeUser('author');
    const name = `Western Lifestyle ${rid()}`;
    const created = await tax.createCategory(admin, { name, description: 'Boots, hats and the culture around the arena.' });
    categoryIds.push(created.id);
    const row = await prisma.category.findUniqueOrThrow({ where: { id: created.id }, select: { id: true, name: true, slug: true } });
    newCategory = row;
  });

  afterAll(async () => {
    if (!available) return;
    const rows = await prisma.article.findMany({ where: { slug: { in: slugs } }, select: { id: true } });
    const ids = rows.map((r) => r.id);
    await prisma.articleBlock.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.articleSeo.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.articleTag.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.articleMedia.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.articleRevision.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.article.deleteMany({ where: { id: { in: ids } } });
    await prisma.subcategory.deleteMany({ where: { id: { in: subcategoryIds } } });
    await prisma.entitySeo.deleteMany({ where: { entityType: 'CATEGORY', entityId: { in: categoryIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  // ---------------------------------------------------- category management

  it('an administrator creates a sixth Category, with a derived slug', async () => {
    expect(newCategory.slug).toMatch(/^western-lifestyle-/);
    expect(await prisma.category.count()).toBeGreaterThanOrEqual(6);
  });

  it('name and description are editable and persist', async () => {
    await tax.updateCategory(admin, newCategory.id, {
      name: newCategory.name, description: 'Updated: western culture, gear and the people behind it.',
    });
    const row = await prisma.category.findUniqueOrThrow({ where: { id: newCategory.id } });
    expect(row.description).toBe('Updated: western culture, gear and the people behind it.');
    expect(row.slug).toBe(newCategory.slug); // the slug is not rewritten by an edit
  });

  it('a duplicate name is refused', async () => {
    await expect(tax.createCategory(admin, { name: newCategory.name }))
      .rejects.toThrow(/already exists/i);
  });

  it('an AUTHOR cannot create a category, and nothing is written', async () => {
    const before = await prisma.category.count();
    await expect(tax.createCategory(author, { name: `Nope ${rid()}` }))
      .rejects.toMatchObject({ code: 'forbidden' });
    expect(await prisma.category.count()).toBe(before);
  });

  // ---------------------------------------------------- article assignment

  it('H-01: an article can be classified under the new Category and reloads with it', async () => {
    const created = await article.saveArticle(admin as never, input({ categoryName: newCategory.name }));
    const row = await prisma.article.findUniqueOrThrow({
      where: { id: created.id }, select: { categoryId: true, category: { select: { name: true } } },
    });
    expect(row.category.name).toBe(newCategory.name);

    // Reload through the editor's own loader.
    const { getEditableArticle } = await import('../lib/cms/adminQueries');
    const payload = await getEditableArticle(created.id);
    expect(payload!.article.category).toBe(newCategory.name);
  });

  it('an article can be reassigned between categories and back', async () => {
    const created = await article.saveArticle(admin as never, input({ categoryName: newCategory.name }));
    await article.saveArticle(admin as never, {
      ...input(), id: created.id, slug: created.slug, categoryName: 'NFR Competition',
    } as ArticleSvc.ArticleInput);
    expect((await prisma.article.findUniqueOrThrow({
      where: { id: created.id }, include: { category: true },
    })).category.name).toBe('NFR Competition');
  });

  it('a nonexistent category is still refused server-side', async () => {
    await expect(article.saveArticle(admin as never, input({ categoryName: `No Such Category ${rid()}` })))
      .rejects.toThrow(/Unknown category/i);
  });

  it('existing articles keep their original categories', async () => {
    const grouped = await prisma.article.groupBy({ by: ['categoryId'], _count: { _all: true } });
    const newCatGroup = grouped.find((g) => g.categoryId === newCategory.id);
    // Only the articles this suite created may sit in the new category.
    const mine = await prisma.article.count({ where: { categoryId: newCategory.id, slug: { in: slugs } } });
    expect(newCatGroup?._count._all ?? 0).toBe(mine);
  });

  // ---------------------------------------------------- subcategories

  it('H-01 + 04-B: a Subcategory under the new Category works and stays section-scoped', async () => {
    const sub = await tax.createSubcategory(admin, { categoryId: newCategory.id, name: `Gear ${rid()}` });
    subcategoryIds.push(sub.id);

    const assignable = await tax.listAssignableSubcategories(newCategory.id);
    expect(assignable.some((s) => s.id === sub.id)).toBe(true);

    // It must NOT be offered for a different section.
    const other = await prisma.category.findFirstOrThrow({ where: { id: { not: newCategory.id } }, select: { id: true } });
    const otherList = await tax.listAssignableSubcategories(other.id);
    expect(otherList.some((s) => s.id === sub.id)).toBe(false);

    // Assigning it to an article in a different section is refused.
    await expect(article.saveArticle(admin as never, input({ categoryName: 'NFR Competition', subcategoryId: sub.id })))
      .rejects.toThrow();

    // …and accepted within its own section.
    const ok = await article.saveArticle(admin as never, input({ categoryName: newCategory.name, subcategoryId: sub.id }));
    expect((await prisma.article.findUniqueOrThrow({ where: { id: ok.id } })).subcategoryId).toBe(sub.id);
  });

  it('legacy subcategory text is untouched by this stage', async () => {
    const labels = (await prisma.article.groupBy({ by: ['subcategory'], _count: { _all: true } }))
      .filter((r) => r.subcategory).length;
    expect(labels).toBeGreaterThan(0);
  });

  // ---------------------------------------------------- H-02 / H-03 resolver

  it('H-02: the archive identity uses the administrator-edited Category description', async () => {
    const id = await content.resolveCategoryArchive(newCategory.slug);
    expect(id.known).toBe(true);
    expect(id.sectionKey).toBeNull();
    expect(id.categoryId).toBe(newCategory.id);
    expect(id.name).toBe(newCategory.name);
    expect(id.description).toBe('Updated: western culture, gear and the people behind it.');
  });

  it('H-03: a canonical section resolves through the SAME resolver', async () => {
    const id = await content.resolveCategoryArchive('nfr-competition');
    expect(id.known).toBe(true);
    expect(id.sectionKey).toBe('competition');
    expect(id.categoryKey).toBe('NFR Competition');
    expect(id.description.length).toBeGreaterThan(0);
  });

  it('H-03: a SectionConfig override now reaches the /categories/ surface too', async () => {
    const existing = await prisma.sectionConfig.findUnique({ where: { sectionKey: 'competition' } });
    try {
      await prisma.sectionConfig.upsert({
        where: { sectionKey: 'competition' },
        update: { displayName: 'Competition Desk', description: 'Override description.' },
        create: { sectionKey: 'competition', displayName: 'Competition Desk', description: 'Override description.' },
      });
      const viaCategories = await content.resolveCategoryArchive('nfr-competition');
      const viaSection = await content.getSectionMeta('competition');
      // The two public surfaces now agree — the H-03 defect.
      expect(viaCategories.name).toBe('Competition Desk');
      expect(viaCategories.description).toBe('Override description.');
      expect(viaSection!.name).toBe('Competition Desk');
      expect(viaSection!.description).toBe('Override description.');
    } finally {
      if (existing) {
        await prisma.sectionConfig.update({
          where: { sectionKey: 'competition' },
          data: { displayName: existing.displayName, description: existing.description },
        });
      } else {
        await prisma.sectionConfig.delete({ where: { sectionKey: 'competition' } }).catch(() => undefined);
      }
    }
  });

  it('precedence: SectionConfig > Category > config default, and a blank override falls through', async () => {
    const existing = await prisma.sectionConfig.findUnique({ where: { sectionKey: 'competition' } });
    try {
      await prisma.sectionConfig.upsert({
        where: { sectionKey: 'competition' },
        update: { displayName: '', description: '   ' },
        create: { sectionKey: 'competition', displayName: '', description: '   ' },
      });
      const id = await content.resolveCategoryArchive('nfr-competition');
      // Blank strings must not win; the Category row (or config) supplies them.
      expect(id.name).toBe('NFR Competition');
      expect(id.description.trim().length).toBeGreaterThan(0);
    } finally {
      if (existing) {
        await prisma.sectionConfig.update({
          where: { sectionKey: 'competition' },
          data: { displayName: existing.displayName, description: existing.description },
        });
      } else {
        await prisma.sectionConfig.delete({ where: { sectionKey: 'competition' } }).catch(() => undefined);
      }
    }
  });

  it('B-01 (Stage 01) still holds: an unknown slug is unknown', async () => {
    const id = await content.resolveCategoryArchive(`no-such-${rid()}`);
    expect(id.known).toBe(false);
    expect(id.categoryId).toBeNull();
    expect(id.sectionKey).toBeNull();
  });

  // ---------------------------------------------------- public archive

  it('the new Category archive lists only its own PUBLISHED articles', async () => {
    const draftOnly = await article.saveArticle(admin as never, input({ categoryName: newCategory.name, title: 'Draft Only' }));
    const published = await article.saveArticle(admin as never, input({ categoryName: newCategory.name, title: 'Published One' }));
    await prisma.article.update({
      where: { id: published.id },
      data: { workflowStatus: 'PUBLISHED', publishedAt: new Date() },
    });

    const rows = await content.getPublishedArticlesByCategory(newCategory.slug);
    const ids = rows.map((a) => a.id);
    expect(ids).toContain(published.id);
    expect(ids).not.toContain(draftOnly.id);
    for (const a of rows) expect(a.category).toBe(newCategory.name);
  });

  it('the five foundational sections are unchanged — names, slugs and ids', async () => {
    for (const name of FOUNDATIONAL) {
      const row = await prisma.category.findFirst({ where: { name }, select: { id: true, slug: true } });
      expect(row, name).toBeTruthy();
      const id = await content.resolveCategoryArchive(row!.slug);
      expect(id.known, name).toBe(true);
      expect(id.categoryKey, name).toBe(name);
    }
  });

  it('H-04: the SectionConfig hero image is readable where the resolver uses it', async () => {
    const existing = await prisma.sectionConfig.findUnique({ where: { sectionKey: 'competition' } });
    try {
      await prisma.sectionConfig.upsert({
        where: { sectionKey: 'competition' },
        update: { heroImage: 'https://cdn.example/section-hero.jpg' },
        create: { sectionKey: 'competition', heroImage: 'https://cdn.example/section-hero.jpg' },
      });
      const { getSectionConfig } = await import('../lib/cms/sectionConfigService');
      expect((await getSectionConfig('competition'))?.heroImage).toBe('https://cdn.example/section-hero.jpg');
    } finally {
      if (existing) {
        await prisma.sectionConfig.update({ where: { sectionKey: 'competition' }, data: { heroImage: existing.heroImage } });
      } else {
        await prisma.sectionConfig.delete({ where: { sectionKey: 'competition' } }).catch(() => undefined);
      }
    }
  });

  /**
   * UPDATED BY STAGE 03 (R-1). Stage 02 asserted that the sitemap listed only
   * the five canonical archives, because a managed category was then never
   * eligible. The owner has since approved conditional inclusion: a managed
   * category joins the sitemap once it holds a published article.
   *
   * The assertion therefore moves from a fixed count to the RULE, which is
   * stronger — it still pins that the five canonical archives are present and
   * that nothing is duplicated, and it now also pins the eligibility condition
   * rather than merely a number that happened to be five.
   */
  it('the sitemap lists the five canonical archives, plus only eligible managed ones', async () => {
    const { buildSitemapEntries } = await import('../lib/seo/sitemapEntries');
    const urls = (await buildSitemapEntries())
      .map((e: { url: string }) => e.url)
      .filter((u: string) => u.includes('/categories/'));

    for (const s of ['nfr-competition', 'nfr-entertainment', 'nfr-events-shopping', 'nfr-plan-watch', 'more-rodeo']) {
      expect(urls.some((u: string) => u.includes(`/categories/${s}/`)), s).toBe(true);
    }
    expect(new Set(urls).size, 'no duplicate URLs').toBe(urls.length);

    // This suite's category is included exactly when it has published content.
    const publishedHere = await prisma.article.count({
      where: { categoryId: newCategory.id, workflowStatus: 'PUBLISHED' },
    });
    expect(urls.some((u: string) => u.includes(newCategory.slug))).toBe(publishedHere > 0);
  });
});
