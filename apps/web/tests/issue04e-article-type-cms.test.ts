import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PrismaClient } from '@prisma/client';
import type { Actor } from '../lib/cms/guard';
import type { RoleKey } from '../lib/auth/rbac';
import type * as AtSvc from '../lib/cms/articleTypeService';
import type * as ArticleSvc from '../lib/cms/articleService';
import type * as TaxSvc from '../lib/cms/taxonomyService';
import type * as Registry from '../lib/cms/articleTypeRegistry';
import type * as Content from '../lib/content';

/**
 * Batch 04-E — Controlled Hybrid Article Type management.
 *
 * The architecture these tests exist to pin: the DATABASE owns the definitions,
 * the CODE owns the rules, and the in-repository registry is the bootstrap seed
 * and the fallback — never an override once rows exist.
 *
 * Two properties get the most attention, because both are silent when broken:
 *
 *   PRESERVATION. No stored `Article.articleType` value is ever rewritten,
 *   renamed or remapped. Deactivating or archiving a type withdraws it from NEW
 *   classification only; articles already carrying it stay published, stay
 *   editable, and keep their place in archive filters.
 *
 *   SEO AUTHORITY. Evergreen eligibility and the Article/NewsArticle
 *   classification are the two settings that change what the public site
 *   asserts about published work. Each is gated by its own permission, and an
 *   unknown or unresolvable type must never be able to produce `NewsArticle`.
 */

let available = false;
let prisma: PrismaClient;
let svc: typeof AtSvc;
let article: typeof ArticleSvc;
let tax: typeof TaxSvc;
let registry: typeof Registry;
let content: typeof Content;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    // Fails fast (and so skips) if the 04-E migration has not been applied.
    await prisma.articleType.count();
    svc = await import('../lib/cms/articleTypeService');
    article = await import('../lib/cms/articleService');
    tax = await import('../lib/cms/taxonomyService');
    registry = await import('../lib/cms/articleTypeRegistry');
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

// ===========================================================================
// Pure tests — no database. These run in every environment, including CI
// without a test database, because they cover the FALLBACK behaviour that a
// database-less deploy depends on (§16, §17.19).
// ===========================================================================

describe('04-E (pure) the compatibility fallback is complete and fails safely', () => {
  it('the fallback snapshot carries all 23 definitions, 18 selectable + 5 retired', async () => {
    const shape = await import('../lib/content/articleTypeShape');
    const snap = shape.fallbackSnapshot();
    expect(snap.source).toBe('fallback');
    expect(snap.types).toHaveLength(23);
    expect(shape.assignableTypes(snap)).toHaveLength(18);
    expect(shape.retiredTypes(snap)).toHaveLength(5);
  });

  it('(19) an unknown, missing or blank type resolves to Article — never NewsArticle', async () => {
    const shape = await import('../lib/content/articleTypeShape');
    const snap = shape.fallbackSnapshot();
    for (const v of ['Freestyle', 'NEWS', '', '  ', 'news-article', null, undefined]) {
      expect(shape.schemaTypeIn(snap, v as string | null), String(v)).toBe('Article');
    }
    /**
     * UPDATED BY BATCH 04-E.1. This assertion used to expect `'Article'` here,
     * and the owner's Case-2 decision changes it: a recognised compatibility
     * type keeps its classification even when the snapshot it was looked up in
     * does not define it. See `tests/issue04e1-governance.test.ts` for the full
     * three-case matrix and the reason (an interrupted bootstrap is reachable).
     */
    expect(shape.schemaTypeIn({ source: 'database', types: [] }, 'News')).toBe('NewsArticle');
    expect(shape.schemaTypeIn({ source: 'database', types: [] }, 'Freestyle')).toBe('Article');
  });

  it('the fallback preserves the approved news and evergreen classifications', async () => {
    const shape = await import('../lib/content/articleTypeShape');
    const snap = shape.fallbackSnapshot();
    expect(shape.schemaTypeIn(snap, 'News')).toBe('NewsArticle');
    expect(shape.schemaTypeIn(snap, 'Event Update')).toBe('NewsArticle');
    expect(shape.schemaTypeIn(snap, 'news')).toBe('NewsArticle');
    expect(shape.schemaTypeIn(snap, 'guide')).toBe('Article');
    const ever = shape.evergreenValuesIn(snap);
    expect(ever).toContain('guide');
    expect(ever).toContain('explainer');
    expect(ever).not.toContain('feature');
    expect(ever).not.toContain('analysis');
  });

  it('(6) value identity is case-folded, so case variants are one identity', async () => {
    const shape = await import('../lib/content/articleTypeShape');
    expect(shape.articleTypeValueKey('News')).toBe(shape.articleTypeValueKey('NEWS'));
    expect(shape.articleTypeValueKey('  Rules &  Format ')).toBe('rules & format');
    expect(shape.normalizeArticleTypeValue('  Ticket   Guide ')).toBe('Ticket Guide');
  });

  it('(6) malformed values are refused with a readable reason, not silently repaired', async () => {
    const shape = await import('../lib/content/articleTypeShape');
    expect(shape.articleTypeValueError('Results & Standings')).toBeNull();
    expect(shape.articleTypeValueError("Editor's Pick")).toBeNull();
    expect(shape.articleTypeValueError('How-To / FAQ')).toBeNull();
    expect(shape.articleTypeValueError('')).toMatch(/enter an article type/i);
    expect(shape.articleTypeValueError('   ')).toMatch(/enter an article type/i);
    expect(shape.articleTypeValueError('<script>')).toMatch(/letters, numbers/i);
    expect(shape.articleTypeValueError('-leading-hyphen')).toMatch(/letters, numbers/i);
    expect(shape.articleTypeValueError('x'.repeat(81))).toMatch(/at most 80/i);
  });

  it('(15) an archive filter keeps a retired type that still has articles', async () => {
    const shape = await import('../lib/content/articleTypeShape');
    const snap = shape.fallbackSnapshot();
    const opts = shape.archiveFilterOptions(snap, [
      { articleType: 'guide' },        // legacy → not selectable
      { articleType: 'How to Watch' }, // selectable
      { articleType: 'Invented Type' },// unknown → shown as stored
    ]);
    const values = opts.map((o) => o.value);
    expect(values).toContain('guide');
    expect(values).toContain('How to Watch');
    expect(values).toContain('Invented Type');
    // Unknown values are labelled as stored, never hidden or substituted.
    expect(opts.find((o) => o.value === 'Invented Type')?.label).toBe('Invented Type');
    expect(opts.find((o) => o.value === 'guide')?.label).toMatch(/legacy/i);
    // A type with no articles here is absent: options are derived from the data.
    expect(values).not.toContain('Preview');
  });

  it('(16) the draft preview prints the MANAGED label, not the stored value', async () => {
    const { ArticleDraftPreview } = await import('../components/admin/editor/ArticleDraftPreview');
    const base = {
      id: 'a1', slug: 's', title: 'T', deck: 'D', excerpt: 'E', content: [], category: 'NFR Competition',
      readTime: '4 min read', author: { name: 'A', role: 'R' }, publishedAt: '2026-01-01',
    } as unknown as import('../types').Article;

    const managed = {
      source: 'database' as const,
      types: [{
        value: 'guide', label: 'Beginner Guide', description: null, sortOrder: 0,
        selectable: true, evergreen: true, schemaType: 'Article' as const, archived: false,
      }],
    };
    const html = renderToStaticMarkup(
      React.createElement(ArticleDraftPreview, {
        article: { ...base, articleType: 'guide' },
        articleTypes: managed,
        onClose: () => {},
      }),
    );
    expect(html).toContain('Beginner Guide');

    // Without a snapshot it falls back to the compiled-in label.
    const fallbackHtml = renderToStaticMarkup(
      React.createElement(ArticleDraftPreview, {
        article: { ...base, articleType: 'guide' },
        onClose: () => {},
      }),
    );
    expect(fallbackHtml).toMatch(/Guide \(legacy\)/i);
  });

  it('(16) an unclassified draft reads as Unclassified, not as an invented type', async () => {
    const { ArticleDraftPreview } = await import('../components/admin/editor/ArticleDraftPreview');
    const base = {
      id: 'a1', slug: 's', title: 'T', deck: 'D', excerpt: 'E', content: [], category: 'NFR Competition',
      readTime: '4 min read', author: { name: 'A', role: 'R' },
    } as unknown as import('../types').Article;
    const html = renderToStaticMarkup(
      React.createElement(ArticleDraftPreview, { article: base, onClose: () => {} }),
    );
    expect(html).toContain('Unclassified');
    expect(html).not.toContain('>Feature<');
  });

  it('(14) articleJsonLd honours an injected classification and still defaults safely', async () => {
    const seo = await import('../lib/seo');
    const a = {
      id: 'x', slug: 's', title: 'T', deck: 'D', excerpt: 'E', content: [], category: 'NFR Competition',
      readTime: '3 min read', author: { name: 'A', role: 'R' }, publishedAt: '2026-01-01', articleType: 'guide',
    } as unknown as import('../types').Article;

    // Managed override wins over the compiled-in classification…
    expect(seo.articleJsonLd(a, { schemaType: 'NewsArticle' })['@type']).toBe('NewsArticle');
    expect(seo.articleJsonLd({ ...a, articleType: 'News' }, { schemaType: 'Article' })['@type']).toBe('Article');
    // …and omitting it preserves the pre-04-E behaviour exactly.
    expect(seo.articleJsonLd(a)['@type']).toBe('Article');
    expect(seo.articleJsonLd({ ...a, articleType: 'News' })['@type']).toBe('NewsArticle');
  });

  it('(10) the RBAC matrix grants articletype.manage to Admin+ only', async () => {
    const { ROLE_PERMISSIONS } = await import('../lib/auth/rbac');
    expect(ROLE_PERMISSIONS.super_admin).toContain('articletype.manage');
    expect(ROLE_PERMISSIONS.administrator).toContain('articletype.manage');
    expect(ROLE_PERMISSIONS.editor).not.toContain('articletype.manage');
    expect(ROLE_PERMISSIONS.author).not.toContain('articletype.manage');
    expect(ROLE_PERMISSIONS.seo_manager).not.toContain('articletype.manage');
    expect(ROLE_PERMISSIONS.reader).not.toContain('articletype.manage');
    // The two SEO-bearing gates, unchanged from the existing model.
    expect(ROLE_PERMISSIONS.seo_manager).toContain('seo.config');
    expect(ROLE_PERMISSIONS.editor).not.toContain('seo.config');
    expect(ROLE_PERMISSIONS.super_admin).toContain('system.config');
    expect(ROLE_PERMISSIONS.administrator).not.toContain('system.config');
  });

  it('(23) no production host appears in this run’s database configuration', () => {
    // A guard, not a formality: every write below targets whatever
    // DATABASE_URL names, and vitest forces it to the disposable test database.
    const url = process.env.DATABASE_URL;
    if (!url) return;
    const host = new URL(url).hostname;
    expect(['localhost', '127.0.0.1', '::1']).toContain(host);
    expect(new URL(url).pathname).not.toMatch(/defaultdb/);
  });
});

// ===========================================================================
// Database-backed behaviour.
// ===========================================================================

suite('Batch 04-E — managed Article Type CMS', () => {
  const users: string[] = [];
  const slugs: string[] = [];
  const extraTypeIds: string[] = [];
  let superAdmin: Actor;
  let admin: Actor;
  let editor: Actor;
  let seoManager: Actor;
  let catA: { id: string; name: string };

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({
      data: { email: `i04e-${roleKey}-${rid()}@example.com`, name: `04E ${roleKey}`, status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    users.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }

  function input(over: Partial<ArticleSvc.ArticleInput> = {}): ArticleSvc.ArticleInput {
    const slug = `i04e-${rid()}`;
    slugs.push(slug);
    return {
      slug, title: 'A Batch 04-E Test Headline',
      excerpt: 'An editorial excerpt long enough to satisfy the publication gate for this test case.',
      blocks: [
        { type: 'paragraph', text: 'An opening paragraph with enough words to pass the publication gate checks.' },
        { type: 'heading', level: 2, text: 'Section' },
      ],
      categoryName: catA.name, authorName: '04E Tester', articleType: 'General Information',
      imageRightsStatus: 'Staff Photo',
      imageAltText: 'A descriptive alt text for the featured test photograph.',
      ...over,
    } as ArticleSvc.ArticleInput;
  }

  const byValue = async (value: string) =>
    prisma.articleType.findUniqueOrThrow({ where: { value } });

  beforeAll(async () => {
    superAdmin = await makeUser('super_admin');
    admin = await makeUser('administrator');
    editor = await makeUser('editor');
    seoManager = await makeUser('seo_manager');
    catA = await prisma.category.findFirstOrThrow({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } });
    // Start from a known empty registry so bootstrap behaviour is observable.
    await prisma.articleType.deleteMany({});
    registry.resetArticleTypeRegistryForTests();
  });

  afterAll(async () => {
    if (!available) return;
    const rows = await prisma.article.findMany({ where: { slug: { in: slugs } }, select: { id: true } });
    const ids = rows.map((r) => r.id);
    await prisma.articleBlock.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.articleSeo.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.articleTag.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.articleMedia.deleteMany({ where: { articleId: { in: ids } } });
    await prisma.article.deleteMany({ where: { id: { in: ids } } });
    // Leave the table as this suite found it: empty. Other suites must not
    // inherit a bootstrapped registry from this one.
    await prisma.articleType.deleteMany({});
    registry.resetArticleTypeRegistryForTests();
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  // ------------------------------------------------- 1-3. bootstrap & data

  it('(1) bootstrap creates all 23 definitions with the approved classifications', async () => {
    const r = await svc.runArticleTypeBootstrap(superAdmin, true);
    expect(r.created).toBe(23);
    expect(r.conflicts).toBe(0);
    expect(r.complete).toBe(true);

    expect(await prisma.articleType.count()).toBe(23);
    expect(await prisma.articleType.count({ where: { selectable: true } })).toBe(18);
    expect(await prisma.articleType.count({ where: { selectable: false } })).toBe(5);
    // The five legacy values exist, are storable, and are not offered.
    for (const v of ['guide', 'explainer', 'feature', 'analysis', 'news']) {
      const row = await byValue(v);
      expect(row.selectable, v).toBe(false);
      expect(row.archivedAt, v).toBeNull();
    }
    // The approved SEO matrix is reproduced, not re-derived.
    expect((await byValue('News')).schemaType).toBe('NEWS_ARTICLE');
    expect((await byValue('Event Update')).schemaType).toBe('NEWS_ARTICLE');
    expect((await byValue('news')).schemaType).toBe('NEWS_ARTICLE');
    expect((await byValue('guide')).schemaType).toBe('ARTICLE');
    expect((await byValue('guide')).evergreen).toBe(true);
    expect((await byValue('explainer')).evergreen).toBe(true);
    expect((await byValue('feature')).evergreen).toBe(false);

    /**
     * The pair that shaped the schema: `News` and the legacy `news` are two
     * DISTINCT stored values, both defined, differing only by case. A
     * case-folded unique constraint would have made one of them impossible, so
     * the column is exact-unique and the case rule lives in the service.
     */
    expect((await byValue('News')).value).toBe('News');
    expect((await byValue('news')).value).toBe('news');
    expect((await byValue('News')).selectable).toBe(true);
    expect((await byValue('news')).selectable).toBe(false);
  });

  it('(1b) the registry now reports itself as database-backed', async () => {
    registry.resetArticleTypeRegistryForTests();
    const snap = await registry.getArticleTypeSnapshot();
    expect(snap.source).toBe('database');
    expect(snap.types).toHaveLength(23);
  });

  it('(2) a repeated bootstrap is idempotent and does not revert administrator changes', async () => {
    // An administrator renames a label and deactivates a type…
    const howTo = await byValue('How to Watch');
    await svc.updateArticleTypeMetadata(admin, howTo.id, { label: 'Watching & Streaming' });
    await svc.setArticleTypeSelectable(admin, howTo.id, false);

    const again = await svc.runArticleTypeBootstrap(superAdmin, true);
    expect(again.created).toBe(0);
    expect(again.present).toBe(23);
    expect(again.conflicts).toBe(0);
    expect(await prisma.articleType.count()).toBe(23);

    // …and the second bootstrap left both changes alone.
    const after = await byValue('How to Watch');
    expect(after.label).toBe('Watching & Streaming');
    expect(after.selectable).toBe(false);

    // Restore for the tests that follow.
    await svc.updateArticleTypeMetadata(admin, howTo.id, { label: 'How to Watch' });
    await svc.setArticleTypeSelectable(admin, howTo.id, true);
  });

  it('(3, 20) bootstrapping rewrote no article: values, slugs and publication state are untouched', async () => {
    const before = await prisma.article.groupBy({ by: ['articleType'], _count: { _all: true }, orderBy: { articleType: 'asc' } });
    const publishedBefore = await prisma.article.findMany({
      where: { workflowStatus: 'PUBLISHED' },
      select: { slug: true, articleType: true, publishedAt: true, workflowStatus: true },
      orderBy: { slug: 'asc' },
    });

    await svc.runArticleTypeBootstrap(superAdmin, true);

    const after = await prisma.article.groupBy({ by: ['articleType'], _count: { _all: true }, orderBy: { articleType: 'asc' } });
    const publishedAfter = await prisma.article.findMany({
      where: { workflowStatus: 'PUBLISHED' },
      select: { slug: true, articleType: true, publishedAt: true, workflowStatus: true },
      orderBy: { slug: 'asc' },
    });
    expect(after).toEqual(before);
    expect(publishedAfter).toEqual(publishedBefore);
  });

  // ------------------------------------------------- 4-6. identity rules

  it('(4) a label change does not touch the stored value', async () => {
    const row = await byValue('Preview');
    await svc.updateArticleTypeMetadata(admin, row.id, { label: 'Round Preview', description: 'Looking ahead.' });
    const after = await prisma.articleType.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.value).toBe('Preview');
    expect(after.label).toBe('Round Preview');
    expect(after.description).toBe('Looking ahead.');
  });

  it('(5) a stored value cannot be renamed — the attempt is refused, not ignored', async () => {
    const row = await byValue('Preview');
    await expect(
      svc.updateArticleTypeMetadata(admin, row.id, { label: 'X', value: 'Prevue' } as AtSvc.ArticleTypeMetadataInput),
    ).rejects.toThrow(/permanent and cannot be changed/i);
    expect((await prisma.articleType.findUniqueOrThrow({ where: { id: row.id } })).value).toBe('Preview');
  });

  it('(6) a duplicate value is refused', async () => {
    await expect(svc.createArticleType(admin, { value: 'Preview', label: 'Dup' }))
      .rejects.toThrow(/already exists/i);
  });

  it('(6) a CASE VARIANT of an existing value is refused for a NEW type', async () => {
    await expect(svc.createArticleType(admin, { value: 'PREVIEW', label: 'Shouty' }))
      .rejects.toThrow(/differ from an existing one only by letter case/i);
    // `news` exists exactly (it is a defined legacy value), so this is the
    // plain duplicate message, not the case-variant one.
    await expect(svc.createArticleType(admin, { value: 'news', label: 'Lower news' }))
      .rejects.toThrow(/already exists/i);
  });

  it('(6) the database enforces EXACT uniqueness; the case rule is the service’s', async () => {
    // Stated as a measured limitation rather than an assumed guarantee: the
    // column cannot carry a case-folded constraint (see the `News`/`news`
    // assertion above), so a direct insert of a case variant SUCCEEDS at the
    // database level. Everything an administrator can reach goes through
    // `createArticleType`, which refuses it.
    const bypass = await prisma.articleType.create({
      data: { value: 'PrEvIeW', label: 'Bypass probe', sortOrder: 900 },
    });
    try {
      // …while the exact value is genuinely unique.
      await expect(
        prisma.articleType.create({ data: { value: 'PrEvIeW', label: 'Dup', sortOrder: 901 } }),
      ).rejects.toThrow();
      // …and the service refuses the variant it would have created.
      await expect(svc.createArticleType(admin, { value: 'preVIEW', label: 'Nope' }))
        .rejects.toThrow(/differ from an existing one only by letter case/i);
    } finally {
      await prisma.articleType.delete({ where: { id: bypass.id } });
      registry.resetArticleTypeRegistryForTests();
    }
  });

  it('a new type is created at the safest settings, whoever creates it', async () => {
    const value = `Test Type ${rid()}`;
    const { id } = await svc.createArticleType(admin, { value, label: 'Test Type' });
    extraTypeIds.push(id);
    const row = await prisma.articleType.findUniqueOrThrow({ where: { id } });
    expect(row.evergreen).toBe(false);
    expect(row.schemaType).toBe('ARTICLE');
    expect(row.selectable).toBe(true);
    expect(row.value).toBe(value);
  });

  // ------------------------------------------------- 7-9. lifecycle

  it('(7) an INACTIVE type cannot be assigned to a new article', async () => {
    const value = `Retired ${rid()}`;
    const { id } = await svc.createArticleType(admin, { value, label: 'Retired' });
    extraTypeIds.push(id);
    await svc.setArticleTypeSelectable(admin, id, false);
    await expect(article.saveArticle(admin, input({ articleType: value })))
      .rejects.toThrow(/no longer offered for new classification/i);
  });

  it('(7) an ARCHIVED type cannot be assigned to a new article either', async () => {
    const value = `Archived ${rid()}`;
    const { id } = await svc.createArticleType(admin, { value, label: 'Archived' });
    extraTypeIds.push(id);
    await svc.setArticleTypeArchived(admin, id, true);
    await expect(article.saveArticle(admin, input({ articleType: value })))
      .rejects.toThrow(/no longer offered for new classification/i);
  });

  it('(7) a value the registry does not define at all is refused', async () => {
    await expect(article.saveArticle(admin, input({ articleType: 'Entirely Invented' })))
      .rejects.toThrow(/Unrecognised article type/i);
  });

  it('(8, 17) an article keeps its type through an unrelated edit after the type is deactivated', async () => {
    const value = `Keepsake ${rid()}`;
    const { id: typeId } = await svc.createArticleType(admin, { value, label: 'Keepsake' });
    extraTypeIds.push(typeId);

    // Classify while it is still offered.
    const created = await article.saveArticle(admin, input({ articleType: value }));
    expect(created.id).toBeTruthy();

    // Withdraw the type, then make a completely unrelated edit.
    await svc.setArticleTypeSelectable(admin, typeId, false);
    const saved = await article.saveArticle(admin, input({
      id: created.id, slug: created.slug, articleType: value, title: 'An Edited 04-E Headline',
    }));
    expect(saved.id).toBe(created.id);

    const row = await prisma.article.findUniqueOrThrow({ where: { id: created.id }, select: { articleType: true, title: true } });
    expect(row.articleType).toBe(value);     // not substituted
    expect(row.title).toBe('An Edited 04-E Headline'); // the edit landed
  });

  it('(8) switching an article AWAY from a retired type to a current one is allowed', async () => {
    const value = `Leaving ${rid()}`;
    const { id: typeId } = await svc.createArticleType(admin, { value, label: 'Leaving' });
    extraTypeIds.push(typeId);
    const created = await article.saveArticle(admin, input({ articleType: value }));
    await svc.setArticleTypeSelectable(admin, typeId, false);

    await article.saveArticle(admin, input({
      id: created.id, slug: created.slug, articleType: 'General Information',
    }));
    expect((await prisma.article.findUniqueOrThrow({ where: { id: created.id } })).articleType)
      .toBe('General Information');
  });

  it('(9) a REFERENCED type cannot be deleted, and the message says what to do instead', async () => {
    const guide = await byValue('guide');
    const used = await prisma.article.count({ where: { articleType: 'guide' } });
    expect(used).toBeGreaterThan(0);
    await expect(svc.deleteArticleType(admin, guide.id))
      .rejects.toThrow(/Cannot delete:.*article\(s\) are classified/i);
    // Still there, still untouched.
    expect((await byValue('guide')).value).toBe('guide');
    expect(await prisma.article.count({ where: { articleType: 'guide' } })).toBe(used);
  });

  it('(9) an UNREFERENCED type can be deleted', async () => {
    const value = `Disposable ${rid()}`;
    const { id } = await svc.createArticleType(admin, { value, label: 'Disposable' });
    await svc.deleteArticleType(admin, id);
    expect(await prisma.articleType.findUnique({ where: { id } })).toBeNull();
  });

  // ------------------------------------------------- 10-12. authorization

  it('(10) an EDITOR cannot create, edit, reorder, deactivate, archive or delete a type', async () => {
    const row = await byValue('Schedule');
    await expect(svc.createArticleType(editor, { value: `Nope ${rid()}`, label: 'Nope' }))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.updateArticleTypeMetadata(editor, row.id, { label: 'Hijacked' }))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.setArticleTypeSelectable(editor, row.id, false))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.setArticleTypeArchived(editor, row.id, true))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.deleteArticleType(editor, row.id))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.reorderArticleTypes(editor, [row.id]))
      .rejects.toMatchObject({ code: 'forbidden' });
    // Nothing changed.
    const after = await prisma.articleType.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.label).toBe('Schedule');
    expect(after.selectable).toBe(true);
    expect(after.archivedAt).toBeNull();
  });

  it('(11) an SEO MANAGER may change evergreen eligibility but NOT the vocabulary', async () => {
    const row = await byValue('Travel Guide');
    await svc.setArticleTypeEvergreen(seoManager, row.id, false);
    expect((await byValue('Travel Guide')).evergreen).toBe(false);
    await svc.setArticleTypeEvergreen(seoManager, row.id, true);
    expect((await byValue('Travel Guide')).evergreen).toBe(true);

    await expect(svc.createArticleType(seoManager, { value: `Seo ${rid()}`, label: 'Seo' }))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.updateArticleTypeMetadata(seoManager, row.id, { label: 'Renamed' }))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.setArticleTypeSchemaType(seoManager, row.id, 'NewsArticle'))
      .rejects.toMatchObject({ code: 'forbidden' });
    expect((await byValue('Travel Guide')).schemaType).toBe('ARTICLE');
  });

  it('(11) an EDITOR cannot change evergreen eligibility', async () => {
    const row = await byValue('History');
    await expect(svc.setArticleTypeEvergreen(editor, row.id, false))
      .rejects.toMatchObject({ code: 'forbidden' });
    expect((await byValue('History')).evergreen).toBe(true);
  });

  it('(12) only SUPER ADMIN may change the Article / NewsArticle classification', async () => {
    const row = await byValue('Schedule');
    await expect(svc.setArticleTypeSchemaType(admin, row.id, 'NewsArticle'))
      .rejects.toThrow(/restricted to Super Admin/i);
    expect((await byValue('Schedule')).schemaType).toBe('ARTICLE');

    await svc.setArticleTypeSchemaType(superAdmin, row.id, 'NewsArticle');
    expect((await byValue('Schedule')).schemaType).toBe('NEWS_ARTICLE');
    await svc.setArticleTypeSchemaType(superAdmin, row.id, 'Article');
    expect((await byValue('Schedule')).schemaType).toBe('ARTICLE');
  });

  it('(12) an unsupported classification is refused', async () => {
    const row = await byValue('Schedule');
    await expect(
      svc.setArticleTypeSchemaType(superAdmin, row.id, 'BlogPosting' as never),
    ).rejects.toThrow(/Unsupported structured-data classification/i);
    expect((await byValue('Schedule')).schemaType).toBe('ARTICLE');
  });

  it('(10) the bootstrap itself requires Super Admin', async () => {
    await expect(svc.runArticleTypeBootstrap(admin, true)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.runArticleTypeBootstrap(editor, false)).rejects.toMatchObject({ code: 'forbidden' });
  });

  // ------------------------------------------------- 13-14, 18. integration

  it('(13, 18) the evergreen query follows the managed flag, immediately after the change', async () => {
    const guide = await byValue('guide');
    expect(await prisma.article.count({ where: { articleType: 'guide' } })).toBeGreaterThan(0);

    // Managed ON → the values list includes it and the surface can show them.
    expect(await registry.getEvergreenArticleTypeValues()).toContain('guide');
    const withGuide = await content.getEvergreenArticles(50);
    expect(withGuide.some((a) => a.articleType === 'guide')).toBe(true);

    // Managed OFF → gone, with no further cache flush from the test: the
    // service invalidated the registry as part of the write.
    await svc.setArticleTypeEvergreen(seoManager, guide.id, false);
    expect(await registry.getEvergreenArticleTypeValues()).not.toContain('guide');
    const withoutGuide = await content.getEvergreenArticles(50);
    expect(withoutGuide.some((a) => a.articleType === 'guide')).toBe(false);

    // The articles themselves never moved.
    expect(await prisma.article.count({ where: { articleType: 'guide', workflowStatus: 'PUBLISHED' } }))
      .toBe(withGuide.filter((a) => a.articleType === 'guide').length);

    await svc.setArticleTypeEvergreen(seoManager, guide.id, true);
    expect(await registry.getEvergreenArticleTypeValues()).toContain('guide');
  });

  it('(14, 18) the structured-data classification follows the managed setting', async () => {
    const guide = await byValue('guide');
    expect(await registry.getArticleSchemaType('guide')).toBe('Article');

    await svc.setArticleTypeSchemaType(superAdmin, guide.id, 'NewsArticle');
    expect(await registry.getArticleSchemaType('guide')).toBe('NewsArticle');

    // And it reaches the JSON-LD through the documented seam.
    const seo = await import('../lib/seo');
    const a = { title: 'T', deck: 'D', author: { name: 'A', role: 'R' }, articleType: 'guide' } as unknown as import('../types').Article;
    expect(seo.articleJsonLd(a, { schemaType: await registry.getArticleSchemaType('guide') })['@type'])
      .toBe('NewsArticle');

    await svc.setArticleTypeSchemaType(superAdmin, guide.id, 'Article');
    expect(await registry.getArticleSchemaType('guide')).toBe('Article');
  });

  it('(14) a managed type that is archived still resolves to Article, never NewsArticle', async () => {
    const news = await byValue('news');
    expect(await registry.getArticleSchemaType('news')).toBe('NewsArticle');
    await svc.setArticleTypeArchived(admin, news.id, true);
    // Archiving does not change classification — the definition is still there.
    expect(await registry.getArticleSchemaType('news')).toBe('NewsArticle');
    await svc.setArticleTypeArchived(admin, news.id, false);
    // But a value with NO definition can never be NewsArticle.
    expect(await registry.getArticleSchemaType('no-such-type')).toBe('Article');
  });

  it('(17) article creation and editing still work end to end with a managed type', async () => {
    const created = await article.saveArticle(admin, input({ articleType: 'Venue Guide' }));
    expect((await prisma.article.findUniqueOrThrow({ where: { id: created.id } })).articleType).toBe('Venue Guide');
    const edited = await article.saveArticle(admin, input({
      id: created.id, slug: created.slug, articleType: 'Ticket Guide', title: 'Retyped 04-E Headline',
    }));
    expect(edited.id).toBe(created.id);
    const row = await prisma.article.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.articleType).toBe('Ticket Guide');
    expect(row.title).toBe('Retyped 04-E Headline');
  });

  it('(18) usage counts and the admin list reflect reality in one query', async () => {
    const rows = await svc.listArticleTypes({ lifecycle: 'all' });
    expect(rows.length).toBeGreaterThanOrEqual(23);
    const guideRow = rows.find((r) => r.value === 'guide')!;
    expect(guideRow.articleCount).toBe(await prisma.article.count({ where: { articleType: 'guide' } }));
    // Ordering is the configured one.
    const orders = rows.map((r) => r.sortOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it('every mutation is audited against the articleType entity', async () => {
    const row = await byValue('Rules & Format');
    await svc.updateArticleTypeMetadata(admin, row.id, { label: 'Rules & Format' });
    const entries = await svc.listArticleTypeAudit(50);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.action === 'articleType.update')).toBe(true);
    expect(entries.some((e) => e.action === 'articleType.bootstrap')).toBe(true);
  });

  // ------------------------------------------------- 19. fail-safe

  it('(19) an EMPTY table falls back to the 23 compatibility definitions, not to nothing', async () => {
    const saved = await prisma.articleType.findMany();
    await prisma.articleType.deleteMany({});
    registry.resetArticleTypeRegistryForTests();
    try {
      const snap = await registry.getArticleTypeSnapshot();
      expect(snap.source).toBe('fallback');
      expect(snap.types).toHaveLength(23);
      // The evergreen surface must not empty out just because the table did.
      expect(await registry.getEvergreenArticleTypeValues()).toContain('guide');
      expect(await registry.getArticleSchemaType('News')).toBe('NewsArticle');
      // And saving an article still works, on the compatibility vocabulary.
      const created = await article.saveArticle(admin, input({ articleType: 'General Information' }));
      expect(created.id).toBeTruthy();
    } finally {
      await prisma.articleType.createMany({
        data: saved.map((r) => ({
          id: r.id, value: r.value, label: r.label, description: r.description,
          sortOrder: r.sortOrder, selectable: r.selectable, evergreen: r.evergreen,
          schemaType: r.schemaType, archivedAt: r.archivedAt,
        })),
      });
      registry.resetArticleTypeRegistryForTests();
    }
  });

  // ------------------------------------------------- 21-22. no regressions

  it('(21) Batch 04-B managed Subcategory behaviour still holds', async () => {
    const r = await tax.createSubcategory(admin, { categoryId: catA.id, name: `04E Probe ${rid()}` });
    try {
      const assignable = await tax.listAssignableSubcategories(catA.id);
      expect(assignable.some((s) => s.id === r.id)).toBe(true);
      // Still refuses a cross-section assignment via the composite FK path.
      const other = await prisma.category.findFirstOrThrow({ where: { id: { not: catA.id } }, select: { name: true } });
      await expect(article.saveArticle(admin, input({ categoryName: other.name, subcategoryId: r.id })))
        .rejects.toThrow();
    } finally {
      await prisma.subcategory.delete({ where: { id: r.id } });
    }
  });

  it('(22) Issue 03 Discipline CMS behaviour still holds', async () => {
    const rodeo = await import('../lib/cms/rodeoService');
    const d = await prisma.discipline.findFirst({
      select: { id: true, name: true, summary: true, tagline: true, image: true },
    });
    if (!d) return;
    const summary = d.summary ?? 'A probe summary for the 04-E regression check.';

    await rodeo.updateDiscipline(admin, d.id, { summary, tagline: 'A 04-E probe tagline' });
    const after = await prisma.discipline.findUniqueOrThrow({ where: { id: d.id } });
    expect(after.tagline).toBe('A 04-E probe tagline');
    // Issue 03 semantics intact: an ABSENT `name`/`image` leaves them unchanged
    // (unlike the pre-existing fields, where absent clears).
    expect(after.name).toBe(d.name);
    expect(after.image).toBe(d.image);

    await rodeo.updateDiscipline(admin, d.id, { summary, tagline: d.tagline ?? undefined });
  });

  it('(23) this suite wrote only to the local test database', async () => {
    const rows = await prisma.$queryRaw<{ db: string; host: string | null }[]>`
      SELECT current_database() AS db, inet_server_addr()::text AS host`;
    expect(rows[0].db).not.toMatch(/defaultdb/);
    expect(rows[0].db).toMatch(/test/);
  });
});
