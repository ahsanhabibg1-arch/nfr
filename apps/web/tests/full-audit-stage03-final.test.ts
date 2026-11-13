import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Actor } from '../lib/cms/guard';
import type { RoleKey } from '../lib/auth/rbac';
import { articleCategoryCrumb } from '../lib/seo/articleBreadcrumb';
import { articleJsonLd, disciplineJsonLd, DEFAULT_PUBLISHER_NAME } from '../lib/seo';
import type { Article, Discipline } from '../types';

/**
 * Stage 03 — the final remediation batch: R-3, R-1, R-4, G-03, H-06, H-05.
 *
 * Each fix is tested for the behaviour it claims, and for the failure case that
 * made it necessary. Two of them replace a silent substitution — a breadcrumb
 * that pointed an unrelated category at NFR Competition, and a publisher name
 * no administrator could change — so the tests assert the *absence* of the old
 * behaviour as well as the presence of the new one.
 */

const article = (over: Partial<Article> = {}): Article => ({
  id: 'a1', slug: 'a-slug', title: 'A Headline', deck: 'Deck', excerpt: 'Excerpt',
  content: [], category: 'NFR Competition', readTime: '4 min read',
  author: { name: 'Writer', role: 'Staff Writer' }, publishedAt: '2026-01-01',
  ...over,
} as Article);

// ===========================================================================
// R-3 — breadcrumbs
// ===========================================================================

describe('Stage 03 — R-3: the article category crumb', () => {
  it('a canonical section keeps its established public URL', () => {
    const cases: [string, string][] = [
      ['NFR Competition', '/competition/'],
      ['NFR Entertainment', '/entertainment/'],
      ['NFR Events & Shopping', '/events-shopping/'],
      ['NFR Plan & Watch', '/plan-watch/'],
    ];
    for (const [name, path] of cases) {
      const crumb = articleCategoryCrumb(article({ category: name, categorySlug: 'ignored' }));
      expect(crumb.path, name).toBe(path);
      expect(crumb.name, name).toBe(name);
    }
  });

  it('a managed non-canonical category links to its own archive', () => {
    const crumb = articleCategoryCrumb(article({ category: 'Western Lifestyle', categorySlug: 'western-lifestyle' }));
    expect(crumb.path).toBe('/categories/western-lifestyle/');
    expect(crumb.name).toBe('Western Lifestyle');
    expect(crumb.resolved).toBe(true);
  });

  it('REGRESSION: an unrelated category is NEVER sent to /competition/', () => {
    for (const name of ['Western Lifestyle', 'Gear Reviews', 'Youth Rodeo', 'Anything At All']) {
      const crumb = articleCategoryCrumb(article({ category: name, categorySlug: 'x-slug' }));
      expect(crumb.path, name).not.toBe('/competition/');
      expect(crumb.path, name).toBe('/categories/x-slug/');
    }
  });

  it('a missing slug degrades to a slugified name, still inside /categories/', () => {
    const crumb = articleCategoryCrumb(article({ category: 'Youth Rodeo', categorySlug: undefined }));
    expect(crumb.path).toBe('/categories/youth-rodeo/');
    expect(crumb.resolved).toBe(false);
  });

  it('a blank slug is treated as missing, not as an empty path segment', () => {
    const crumb = articleCategoryCrumb(article({ category: 'Youth Rodeo', categorySlug: '   ' }));
    expect(crumb.path).toBe('/categories/youth-rodeo/');
  });

  it('the rendered breadcrumb href matches the breadcrumb JSON-LD url', async () => {
    /**
     * The defect this replaces was a DISAGREEMENT: the visible trail fell back
     * to `/competition/` while the JSON-LD built its own path from a slugified
     * name. So the test compares the two real outputs — the href React actually
     * renders, and the url the structured data actually carries — rather than
     * checking that both files mention the same helper.
     */
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { ArticleHeader } = await import('../components/editorial/ArticleHeader');
    const { breadcrumbJsonLd, SITE_URL } = await import('../lib/seo');

    for (const [name, slug] of [
      ['NFR Competition', 'nfr-competition'],
      ['Western Lifestyle', 'western-lifestyle'],
      ['Youth Rodeo', 'youth-rodeo'],
    ] as [string, string][]) {
      const a = article({ category: name, categorySlug: slug });

      const html = renderToStaticMarkup(React.createElement(ArticleHeader, { article: a }));
      // `Breadcrumbs` normalises away the trailing slash, so compare destinations
      // rather than exact strings — what matters is that both point at one place.
      const norm = (u: string) => u.replace(/\/+$/, '') || '/';
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => norm(m[1]));

      const crumb = articleCategoryCrumb(a);
      const ld = breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: crumb.name, path: crumb.path },
        { name: a.title, path: `/articles/${a.slug}/` },
      ]) as { itemListElement: { name: string; item: string }[] };
      const ldCategoryItem = ld.itemListElement.find((i) => i.name === name)!;

      // The rendered trail links exactly where the structured data says it does.
      expect(hrefs, `${name}: rendered href`).toContain(norm(crumb.path));
      expect(norm(ldCategoryItem.item), `${name}: json-ld url`).toBe(norm(`${SITE_URL}${crumb.path}`));
      // …and for a non-canonical category that is never NFR Competition.
      if (name !== 'NFR Competition') {
        expect(hrefs, name).not.toContain('/competition');
        expect(ldCategoryItem.item, name).not.toContain('/competition/');
      }
    }
  });
});

// ===========================================================================
// H-06 — publisher
// ===========================================================================

describe('Stage 03 — H-06: the JSON-LD publisher', () => {
  const publisherOf = (ld: Record<string, unknown>): string =>
    (ld.publisher as { name: string }).name;

  it('uses the configured site name when one is supplied', () => {
    expect(publisherOf(articleJsonLd(article(), { publisherName: 'Rodeo Desk Media' })))
      .toBe('Rodeo Desk Media');
    expect(publisherOf(disciplineJsonLd({ name: 'Bull Riding', summary: 'S' } as Discipline, { publisherName: 'Rodeo Desk Media' })))
      .toBe('Rodeo Desk Media');
  });

  it('falls back to the shipped default when nothing is configured', () => {
    expect(publisherOf(articleJsonLd(article()))).toBe(DEFAULT_PUBLISHER_NAME);
    expect(publisherOf(articleJsonLd(article(), {}))).toBe(DEFAULT_PUBLISHER_NAME);
    expect(publisherOf(articleJsonLd(article(), { publisherName: '   ' }))).toBe(DEFAULT_PUBLISHER_NAME);
    expect(publisherOf(disciplineJsonLd({ name: 'B', summary: 'S' } as Discipline))).toBe(DEFAULT_PUBLISHER_NAME);
    expect(DEFAULT_PUBLISHER_NAME).toBe('NFRGuide');
  });

  it('author identity stays separate from publisher identity', () => {
    const ld = articleJsonLd(article(), { publisherName: 'Rodeo Desk Media' });
    expect((ld.author as { name: string }).name).toBe('Writer');
    expect((ld.author as { '@type': string })['@type']).toBe('Person');
    expect((ld.publisher as { '@type': string })['@type']).toBe('Organization');
  });

  it('the builders stay SYNCHRONOUS — no database access was introduced', () => {
    expect(articleJsonLd(article())).not.toBeInstanceOf(Promise);
    expect(disciplineJsonLd({ name: 'B', summary: 'S' } as Discipline)).not.toBeInstanceOf(Promise);
  });

  it('schema.org output stays valid: @context, @type and publisher url survive', () => {
    const ld = articleJsonLd(article(), { publisherName: 'X' });
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('Article');
    expect((ld.publisher as { url: string }).url).toMatch(/^https?:\/\//);
  });
});

// ===========================================================================
// R-4 — homepage filter
// ===========================================================================

describe('Stage 03 — R-4: the homepage filter is derived, not hardcoded', () => {
  it('the compiled-in CATEGORIES list is gone', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('components/sections/LatestCoverage.tsx', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/const CATEGORIES/);
    expect(code).toMatch(/deriveCategories/);
    expect(code).toMatch(/categories\.map/);
  });

  it('an administrator-created category appears once its articles are in the feed', async () => {
    const { LatestCoverage } = await import('../components/sections/LatestCoverage');
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(
      React.createElement(LatestCoverage, {
        articles: [
          article({ id: '1', category: 'NFR Competition' }),
          article({ id: '2', category: 'Western Lifestyle' }),
        ],
        onSelectArticle: () => {},
      } as never),
    );
    expect(html).toContain('Western Lifestyle');
    expect(html).toContain('NFR Competition');
    expect(html).toContain('All');
  });

  it('a category with no articles in the feed is NOT displayed', async () => {
    const { LatestCoverage } = await import('../components/sections/LatestCoverage');
    const React = await import('react');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const html = renderToStaticMarkup(
      React.createElement(LatestCoverage, {
        articles: [article({ id: '1', category: 'NFR Competition' })],
        onSelectArticle: () => {},
      } as never),
    );
    expect(html).not.toContain('Western Lifestyle');
    // Default behaviour with no articles at all: just the "All" tab, no crash.
    const empty = renderToStaticMarkup(
      React.createElement(LatestCoverage, { articles: [], onSelectArticle: () => {} } as never),
    );
    expect(empty).toContain('All');
  });
});

// ===========================================================================
// H-05 — the SectionConfig.visible decision
// ===========================================================================

describe('Stage 03 — H-05: SectionConfig.visible is formally deprecated', () => {
  it('the column is retained and documented, not dropped', async () => {
    const { readFileSync } = await import('node:fs');
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    const model = schema.slice(schema.indexOf('model SectionConfig'));
    expect(model).toContain('visible     Boolean  @default(true)');
    expect(model).toMatch(/DEPRECATED, retained for compatibility/);
  });

  it('nothing reads it — Navigation remains the single visibility authority', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const path = await import('node:path');
    const roots = ['lib', 'app', 'views', 'components'];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const full = path.join(dir, e);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx)$/.test(e)) continue;
        const src = readFileSync(full, 'utf8');
        // A read of the field would look like `.visible` on a sectionConfig value.
        if (/sectionConfig[\s\S]{0,120}\.visible\b/.test(src)) hits.push(full);
      }
    };
    for (const r of roots) walk(r);
    expect(hits).toEqual([]);
  });
});

// ===========================================================================
// Database-backed: G-03, R-1 and the end-to-end workflow.
// ===========================================================================

let available = false;
let prisma: PrismaClient;
let tax: typeof import('../lib/cms/taxonomyService');
let articleSvc: typeof import('../lib/cms/articleService');
let content: typeof import('../lib/content');

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    tax = await import('../lib/cms/taxonomyService');
    articleSvc = await import('../lib/cms/articleService');
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

suite('Stage 03 (db) — tag rename, dynamic sitemap, end-to-end workflow', () => {
  const users: string[] = [];
  const slugs: string[] = [];
  const categoryIds: string[] = [];
  const subcategoryIds: string[] = [];
  const tagIds: string[] = [];
  let admin: Actor;
  let author: Actor;
  let category: { id: string; name: string; slug: string };

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({
      data: { email: `s03-${roleKey}-${rid()}@example.com`, name: `S03 ${roleKey}`, status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    users.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }

  function input(over: Record<string, unknown> = {}) {
    const slug = `s03-${rid()}`;
    slugs.push(slug);
    return {
      slug, title: 'A Stage 03 Headline',
      excerpt: 'An editorial excerpt long enough to satisfy the publication gate for this test case.',
      blocks: [
        { type: 'paragraph', text: 'An opening paragraph with enough words to pass the publication gate checks.' },
        { type: 'heading', level: 2, text: 'Section' },
      ],
      categoryName: category.name, authorName: 'S03 Tester', articleType: 'General Information',
      imageRightsStatus: 'Staff Photo',
      imageAltText: 'A descriptive alt text for the featured test photograph.',
      ...over,
    } as never;
  }

  const categoryUrls = async (): Promise<string[]> => {
    const { buildSitemapEntries } = await import('../lib/seo/sitemapEntries');
    return (await buildSitemapEntries())
      .map((e: { url: string }) => e.url)
      .filter((u: string) => u.includes('/categories/'));
  };

  beforeAll(async () => {
    admin = await makeUser('administrator');
    author = await makeUser('author');
    const created = await tax.createCategory(admin, {
      name: `Stage03 Section ${rid()}`, description: 'An administrator-created section.',
    });
    categoryIds.push(created.id);
    category = await prisma.category.findUniqueOrThrow({
      where: { id: created.id }, select: { id: true, name: true, slug: true },
    });
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
    await prisma.articleTag.deleteMany({ where: { tagId: { in: tagIds } } });
    await prisma.tag.deleteMany({ where: { id: { in: tagIds } } });
    await prisma.subcategory.deleteMany({ where: { id: { in: subcategoryIds } } });
    await prisma.entitySeo.deleteMany({ where: { entityType: 'CATEGORY', entityId: { in: categoryIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  // ------------------------------------------------------------- G-03

  it('G-03: a rename preserves the tag id and EVERY article association', async () => {
    const original = `S03 Gear ${rid()}`;
    const { id } = await tax.createTag(admin, original);
    tagIds.push(id);

    // Attach it to two articles through the normal save path.
    const a1 = await articleSvc.saveArticle(admin as never, input({ tags: [original] }));
    const a2 = await articleSvc.saveArticle(admin as never, input({ tags: [original] }));
    const before = await prisma.articleTag.findMany({ where: { tagId: id }, select: { articleId: true } });
    expect(before.map((r) => r.articleId).sort()).toEqual([a1.id, a2.id].sort());

    const renamed = `S03 Equipment ${rid()}`;
    await tax.updateTag(admin, id, renamed);

    const row = await prisma.tag.findUniqueOrThrow({ where: { id } });
    expect(row.id).toBe(id);                       // identity preserved
    expect(row.name).toBe(renamed);
    expect(row.slug).toBe(renamed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));

    const after = await prisma.articleTag.findMany({ where: { tagId: id }, select: { articleId: true } });
    expect(after.map((r) => r.articleId).sort()).toEqual(before.map((r) => r.articleId).sort());

    // The public article output carries the new name.
    const reloaded = await prisma.article.findUniqueOrThrow({
      where: { id: a1.id }, include: { tags: { include: { tag: true } } },
    });
    expect(reloaded.tags.map((t) => t.tag.name)).toContain(renamed);
  });

  it('G-03: rename is NOT delete-and-recreate — the row is updated in place', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('lib/cms/taxonomyService.ts', 'utf8');
    const fn = src.slice(src.indexOf('export async function updateTag'), src.indexOf('export async function deleteTag'));
    expect(fn).toContain('prisma.tag.update');
    expect(fn).not.toContain('prisma.tag.delete');
    expect(fn).not.toContain('prisma.tag.create');
  });

  it('G-03: a duplicate name is refused and nothing changes', async () => {
    const a = await tax.createTag(admin, `S03 Alpha ${rid()}`);
    const bName = `S03 Beta ${rid()}`;
    const b = await tax.createTag(admin, bName);
    tagIds.push(a.id, b.id);
    const aRow = await prisma.tag.findUniqueOrThrow({ where: { id: a.id } });
    await expect(tax.updateTag(admin, a.id, bName)).rejects.toThrow(/already called/i);
    const after = await prisma.tag.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.name).toBe(aRow.name);
    expect(after.slug).toBe(aRow.slug);
  });

  it('G-03: an unknown tag is rejected, and an AUTHOR cannot rename', async () => {
    await expect(tax.updateTag(admin, `no-such-tag-${rid()}`, 'X')).rejects.toMatchObject({ code: 'not_found' });
    const t = await tax.createTag(admin, `S03 Guard ${rid()}`);
    tagIds.push(t.id);
    const before = await prisma.tag.findUniqueOrThrow({ where: { id: t.id } });
    await expect(tax.updateTag(author, t.id, 'Hijacked')).rejects.toMatchObject({ code: 'forbidden' });
    expect((await prisma.tag.findUniqueOrThrow({ where: { id: t.id } })).name).toBe(before.name);
  });

  it('G-03: renaming to the same name is a no-op, not an error', async () => {
    const name = `S03 Same ${rid()}`;
    const t = await tax.createTag(admin, name);
    tagIds.push(t.id);
    await expect(tax.updateTag(admin, t.id, name)).resolves.toBeUndefined();
  });

  // ------------------------------------------------------------- R-1

  it('R-1: an EMPTY managed category is excluded from the sitemap', async () => {
    const urls = await categoryUrls();
    expect(urls.some((u) => u.includes(category.slug))).toBe(false);
    expect(urls).toHaveLength(5); // the five canonical archives, unchanged
  });

  it('R-1: a DRAFT-only managed category is still excluded', async () => {
    await articleSvc.saveArticle(admin as never, input({ title: 'Draft only' }));
    const urls = await categoryUrls();
    expect(urls.some((u) => u.includes(category.slug))).toBe(false);
  });

  it('R-1: a managed category with a PUBLISHED article is included, exactly once', async () => {
    const created = await articleSvc.saveArticle(admin as never, input({ title: 'Published one' }));
    await prisma.article.update({
      where: { id: created.id }, data: { workflowStatus: 'PUBLISHED', publishedAt: new Date() },
    });
    const urls = await categoryUrls();
    const mine = urls.filter((u) => u.includes(category.slug));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatch(new RegExp(`/categories/${category.slug}/$`));
    expect(urls).toHaveLength(6);
    // The five canonical archives are still present.
    for (const s of ['nfr-competition', 'nfr-entertainment', 'nfr-events-shopping', 'nfr-plan-watch', 'more-rodeo']) {
      expect(urls.some((u) => u.includes(`/categories/${s}/`)), s).toBe(true);
    }
    // No duplicates anywhere.
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('R-1: an editor noindex removes it again — SEO Intelligence still wins', async () => {
    await prisma.entitySeo.create({ data: { entityType: 'CATEGORY', entityId: category.id, noindex: true } });
    try {
      const urls = await categoryUrls();
      expect(urls.some((u) => u.includes(category.slug))).toBe(false);
      expect(urls).toHaveLength(5);
    } finally {
      await prisma.entitySeo.deleteMany({ where: { entityType: 'CATEGORY', entityId: category.id } });
    }
  });

  it('R-1: archiving the article removes the category from the sitemap again', async () => {
    const published = await prisma.article.findFirstOrThrow({
      where: { categoryId: category.id, workflowStatus: 'PUBLISHED' }, select: { id: true },
    });
    expect((await categoryUrls()).some((u) => u.includes(category.slug))).toBe(true);
    await prisma.article.update({ where: { id: published.id }, data: { workflowStatus: 'ARCHIVED' } });
    try {
      expect((await categoryUrls()).some((u) => u.includes(category.slug))).toBe(false);
    } finally {
      await prisma.article.update({ where: { id: published.id }, data: { workflowStatus: 'PUBLISHED' } });
    }
  });

  // ------------------------------------------------- end-to-end (§10)

  it('§10: the complete workflow — create, classify, subcategorise, publish, render', async () => {
    // 1-2. the category exists and is editable (beforeAll + this edit)
    await tax.updateCategory(admin, category.id, { name: category.name, description: 'Edited in the workflow.' });

    // 3. the editor offers it
    const cats = await tax.listCategories();
    expect(cats.some((c) => c.id === category.id)).toBe(true);

    // 6. a managed subcategory under it
    const sub = await tax.createSubcategory(admin, { categoryId: category.id, name: `Flow ${rid()}` });
    subcategoryIds.push(sub.id);

    // 4-5. create with both, then reload
    const created = await articleSvc.saveArticle(admin as never, input({ subcategoryId: sub.id, title: 'Workflow Article' }));
    const { getEditableArticle } = await import('../lib/cms/adminQueries');
    const payload = await getEditableArticle(created.id);
    expect(payload!.article.category).toBe(category.name);
    // The editor payload exposes the managed subcategory through the mapped
    // `subcategory` label (04-B prefers the managed name over the legacy text).
    expect(payload!.article.subcategory).toBeTruthy();

    // 7. publish
    await prisma.article.update({
      where: { id: created.id }, data: { workflowStatus: 'PUBLISHED', publishedAt: new Date() },
    });

    // 8-9. the public article carries the right crumb, and the JSON-LD matches it
    const pub = await content.getPublishedArticleBySlug(created.slug);
    expect(pub).toBeTruthy();
    expect(pub!.category).toBe(category.name);
    expect(pub!.categorySlug).toBe(category.slug);
    const crumb = articleCategoryCrumb(pub!);
    expect(crumb.path).toBe(`/categories/${category.slug}/`);
    expect(crumb.path).not.toBe('/competition/');

    // 10. the archive lists it
    const archive = await content.getPublishedArticlesByCategory(category.slug);
    expect(archive.some((a) => a.id === created.id)).toBe(true);

    // 11. and the sitemap now includes the category
    expect((await categoryUrls()).some((u) => u.includes(category.slug))).toBe(true);

    // 13-14. a tag rename keeps the association (covered in depth above)
    const identity = await content.resolveCategoryArchive(category.slug);
    expect(identity.description).toBe('Edited in the workflow.');
  });

  it('§11: Stage 01 and Stage 02 behaviour is intact', async () => {
    const unknown = await content.resolveCategoryArchive(`still-unknown-${rid()}`);
    expect(unknown.known).toBe(false);                       // Stage 01
    const canonical = await content.resolveCategoryArchive('nfr-competition');
    expect(canonical.sectionKey).toBe('competition');        // Stage 02
    expect(canonical.categoryKey).toBe('NFR Competition');
  });

  it('§16: no persistent Stage 03 fixture leaks into shared tables', async () => {
    // Everything this suite creates is namespaced and removed in afterAll; the
    // assertion here is that nothing ELSE acquired the new category.
    const foreign = await prisma.article.count({
      where: { categoryId: category.id, slug: { notIn: slugs } },
    });
    expect(foreign).toBe(0);
  });
});
