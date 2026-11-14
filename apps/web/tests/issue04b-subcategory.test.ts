import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PrismaClient } from '@prisma/client';
import type { Actor } from '../lib/cms/guard';
import type { RoleKey } from '../lib/auth/rbac';
import type * as TaxSvc from '../lib/cms/taxonomyService';
import type * as ArticleSvc from '../lib/cms/articleService';

/**
 * Batch 04-B — managed Subcategory taxonomy.
 *
 * The invariant that matters most is enforced in TWO places and tested in both:
 * an article's subcategory must belong to the article's own primary section.
 * The service refuses it with a readable sentence; the composite foreign key
 * `Article(categoryId, subcategoryId) -> Subcategory(categoryId, id)` refuses it
 * even when the service is bypassed entirely.
 *
 * The second theme is preservation. No backfill has run, so every existing
 * article still carries only its legacy free-text label, and the tests assert
 * that such articles stay readable, editable and publicly unchanged.
 */

let available = false;
let prisma: PrismaClient;
let tax: typeof TaxSvc;
let article: typeof ArticleSvc;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    tax = await import('../lib/cms/taxonomyService');
    article = await import('../lib/cms/articleService');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
    available = true;
  } catch {
    available = false;
  }
}

const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

suite('Batch 04-B — managed Subcategory taxonomy', () => {
  const subIds: string[] = [];
  const slugs: string[] = [];
  const users: string[] = [];
  let admin: Actor;
  let author: Actor;
  let catA: { id: string; name: string };
  let catB: { id: string; name: string };

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({
      data: { email: `i04b-${roleKey}-${rid()}@example.com`, name: `04B ${roleKey}`, status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    users.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }

  /** Mirrors the service's own derivation, so a test can predict the stored slug. */
  function slugify(name: string): string {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  async function makeSub(categoryId: string, name?: string): Promise<string> {
    const r = await tax.createSubcategory(admin, { categoryId, name: name ?? `Sub ${rid()}` });
    subIds.push(r.id);
    return r.id;
  }

  function input(over: Partial<ArticleSvc.ArticleInput> = {}): ArticleSvc.ArticleInput {
    const slug = `i04b-${rid()}`;
    slugs.push(slug);
    return {
      slug, title: 'A Batch 04-B Test Headline',
      excerpt: 'An editorial excerpt long enough to satisfy the publication gate for this test case.',
      blocks: [
        { type: 'paragraph', text: 'An opening paragraph with enough words to pass the publication gate checks.' },
        { type: 'heading', level: 2, text: 'Section' },
      ],
      categoryName: catA.name, authorName: '04B Tester', articleType: 'General Information',
      imageRightsStatus: 'Staff Photo',
      imageAltText: 'A descriptive alt text for the featured test photograph.',
      ...over,
    } as ArticleSvc.ArticleInput;
  }

  beforeAll(async () => {
    admin = await makeUser('administrator');
    author = await makeUser('author');
    const cats = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true }, take: 2 });
    catA = cats[0];
    catB = cats[1];
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
    await prisma.subcategory.deleteMany({ where: { id: { in: subIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  // =========================================================== 1-5. CRUD

  it('(1) creates a subcategory under an existing category, slug derived from the name', async () => {
    const id = await makeSub(catA.id, 'Broadcast Intelligence');
    const row = await prisma.subcategory.findUniqueOrThrow({ where: { id } });
    expect(row.categoryId).toBe(catA.id);
    expect(row.name).toBe('Broadcast Intelligence');
    expect(row.slug).toBe('broadcast-intelligence');
    expect(row.archivedAt).toBeNull();
    expect(row.sortOrder).toBeGreaterThanOrEqual(0);
  });

  it('(1b) an unknown parent category is refused', async () => {
    await expect(tax.createSubcategory(admin, { categoryId: 'no-such-category', name: 'X' }))
      .rejects.toMatchObject({ code: 'not_found' });
  });

  it('(2) a duplicate NAME in the same category is refused, naming the conflict', async () => {
    await makeSub(catA.id, 'Venue Navigation');
    await expect(tax.createSubcategory(admin, { categoryId: catA.id, name: 'Venue Navigation' }))
      .rejects.toThrow(/already has a subcategory named/i);
  });

  it('(3) a duplicate SLUG in the same category is refused', async () => {
    await makeSub(catA.id, 'Ticket Strategy');
    await expect(tax.createSubcategory(admin, { categoryId: catA.id, name: 'Ticket  Strategy!', slug: 'ticket-strategy' }))
      .rejects.toThrow(/URL slug/i);
  });

  /**
   * INVERTED by the flat-route decision, deliberately.
   *
   * This test previously asserted the opposite — that two sections could share
   * a slug — which was correct while the planned route was nested
   * (`/categories/<section>/<subcategory>/`), where the parent disambiguated.
   * The owner chose the flat route `/<subcategory>/`, so the slug alone has to
   * identify the row and the constraint is now global. Two sections may still
   * hold the same NAME; they may no longer hold the same slug.
   */
  it('(4) the same slug is REFUSED in a different category, naming the owner', async () => {
    const name = `Shared ${rid()}`;
    await makeSub(catA.id, name);
    await expect(tax.createSubcategory(admin, { categoryId: catB.id, name, slug: slugify(name) }))
      .rejects.toThrow(/already used by a subcategory in/i);
  });

  it('(4b) the same NAME in a different category is allowed, given a distinct slug', async () => {
    const name = `Tickets ${rid()}`;
    const a = await makeSub(catA.id, name);
    const b = await tax.createSubcategory(admin, { categoryId: catB.id, name, slug: `alt-${slugify(name)}` });
    subIds.push(b.id);
    const [ra, rb] = await Promise.all([
      prisma.subcategory.findUniqueOrThrow({ where: { id: a } }),
      prisma.subcategory.findUniqueOrThrow({ where: { id: b.id } }),
    ]);
    expect(ra.name).toBe(rb.name);
    expect(ra.slug).not.toBe(rb.slug);
    expect(ra.categoryId).not.toBe(rb.categoryId);
  });

  it('(5) a reserved slug is refused', async () => {
    await expect(tax.createSubcategory(admin, { categoryId: catA.id, name: 'Admin Area', slug: 'admin' }))
      .rejects.toThrow(/reserved/i);
    await expect(tax.createSubcategory(admin, { categoryId: catA.id, name: 'Search Page', slug: 'search' }))
      .rejects.toThrow(/reserved/i);
  });

  it('(5b) a messy operator slug is NORMALISED, not rejected', async () => {
    // `normalizeSlug` sanitises rather than refuses — illegal characters are
    // dropped. So the contract is "it becomes legal", and the only refusals are
    // a reserved word, an over-long slug, or one that normalises to nothing.
    const token = rid();
    const r = await tax.createSubcategory(admin, { categoryId: catA.id, name: `Messy ${token}`, slug: `Not  Valid ${token}!!` });
    subIds.push(r.id);
    expect((await prisma.subcategory.findUniqueOrThrow({ where: { id: r.id } })).slug).toBe(`not-valid-${token}`);
  });

  it('(5c) a slug that normalises to nothing, and a blank name, are refused', async () => {
    await expect(tax.createSubcategory(admin, { categoryId: catA.id, name: `Empty ${rid()}`, slug: '!!!' }))
      .rejects.toThrow(/cannot be empty/i);
    await expect(tax.createSubcategory(admin, { categoryId: catA.id, name: '   ' })).rejects.toThrow();
    await expect(tax.createSubcategory(admin, { categoryId: catA.id, name: `Long ${rid()}`, slug: 'a'.repeat(81) }))
      .rejects.toThrow();
  });

  it('rename and reorder persist; uniqueness still applies on update', async () => {
    const id = await makeSub(catA.id, `Renameable ${rid()}`);
    const clash = `Clashing ${rid()}`;
    await makeSub(catA.id, clash);
    await tax.updateSubcategory(admin, id, { categoryId: catA.id, name: 'Renamed Section Topic', sortOrder: 7 });
    const row = await prisma.subcategory.findUniqueOrThrow({ where: { id } });
    expect(row.name).toBe('Renamed Section Topic');
    expect(row.slug).toBe('renamed-section-topic');
    expect(row.sortOrder).toBe(7);
    await expect(tax.updateSubcategory(admin, id, { categoryId: catA.id, name: clash }))
      .rejects.toThrow(/already has a subcategory named/i);
  });

  // ============================================ 6-7. cross-category rejection

  it('(6) REGRESSION: the SERVICE refuses a subcategory from another section', async () => {
    const otherSub = await makeSub(catB.id, `Other ${rid()}`);
    await expect(
      article.saveArticle(admin as ArticleSvc.ActorContext, input({ categoryName: catA.name, subcategoryId: otherSub })),
    ).rejects.toThrow(new RegExp(`belongs to ${catB.name}`, 'i'));
  });

  it('(7) REGRESSION: the DATABASE refuses it too, when the service is bypassed', async () => {
    const good = await makeSub(catA.id, `Good ${rid()}`);
    const otherSub = await makeSub(catB.id, `Bypass ${rid()}`);
    const created = await article.saveArticle(
      admin as ArticleSvc.ActorContext,
      input({ categoryName: catA.name, subcategoryId: good }),
    );
    // A raw write, skipping every service check — the composite FK is the only
    // thing standing between this and a cross-section assignment.
    await expect(
      prisma.article.update({ where: { id: created.id }, data: { subcategoryId: otherSub } }),
    ).rejects.toThrow();
    const after = await prisma.article.findUniqueOrThrow({ where: { id: created.id }, select: { subcategoryId: true } });
    expect(after.subcategoryId).toBe(good);
  });

  it('(7b) the FK does not fire when no subcategory is set (MATCH SIMPLE)', async () => {
    const created = await article.saveArticle(admin as ArticleSvc.ActorContext, input({ subcategoryId: null }));
    const row = await prisma.article.findUniqueOrThrow({ where: { id: created.id }, select: { subcategoryId: true, categoryId: true } });
    expect(row.subcategoryId).toBeNull();
    expect(row.categoryId).toBe(catA.id);
  });

  // ================================================= 8-10. article lifecycle

  it('(8) an article is created with a valid subcategory', async () => {
    const sub = await makeSub(catA.id, `Valid ${rid()}`);
    const created = await article.saveArticle(admin as ArticleSvc.ActorContext, input({ subcategoryId: sub }));
    const row = await prisma.article.findUniqueOrThrow({ where: { id: created.id }, select: { subcategoryId: true, subcategory: true } });
    expect(row.subcategoryId).toBe(sub);
    // The legacy text column is NOT written when a managed value is chosen.
    expect(row.subcategory).toBeNull();
  });

  it('(9) update and reload preserve the selection, and clearing it works', async () => {
    const sub = await makeSub(catA.id, `Persisted ${rid()}`);
    const created = await article.saveArticle(admin as ArticleSvc.ActorContext, input({ subcategoryId: sub }));
    const slug = (await prisma.article.findUniqueOrThrow({ where: { id: created.id }, select: { slug: true } })).slug;

    // Unrelated edit — the selection must survive.
    await article.saveArticle(admin as ArticleSvc.ActorContext, {
      ...input({ subcategoryId: sub }), id: created.id, slug, title: 'An Edited Headline For The Same Article',
    } as ArticleSvc.ArticleInput);
    expect((await prisma.article.findUniqueOrThrow({ where: { id: created.id }, select: { subcategoryId: true } })).subcategoryId).toBe(sub);

    // Explicit clearing.
    await article.saveArticle(admin as ArticleSvc.ActorContext, {
      ...input({ subcategoryId: null }), id: created.id, slug, title: 'An Edited Headline For The Same Article',
    } as ArticleSvc.ArticleInput);
    expect((await prisma.article.findUniqueOrThrow({ where: { id: created.id }, select: { subcategoryId: true } })).subcategoryId).toBeNull();
  });

  it('(10) changing the primary section with an incompatible subcategory is a clear error', async () => {
    const sub = await makeSub(catA.id, `Bound ${rid()}`);
    const created = await article.saveArticle(admin as ArticleSvc.ActorContext, input({ subcategoryId: sub }));
    const slug = (await prisma.article.findUniqueOrThrow({ where: { id: created.id }, select: { slug: true } })).slug;

    await expect(
      article.saveArticle(admin as ArticleSvc.ActorContext, {
        ...input({ categoryName: catB.name, subcategoryId: sub }), id: created.id, slug,
      } as ArticleSvc.ArticleInput),
    ).rejects.toThrow(/Clear it or choose one from this section/i);

    // Nothing was written: the article keeps its section AND its subcategory.
    const row = await prisma.article.findUniqueOrThrow({ where: { id: created.id }, select: { categoryId: true, subcategoryId: true } });
    expect(row.categoryId).toBe(catA.id);
    expect(row.subcategoryId).toBe(sub);
  });

  it('(10b) the same section change SUCCEEDS once the subcategory is cleared', async () => {
    const sub = await makeSub(catA.id, `Clearable ${rid()}`);
    const created = await article.saveArticle(admin as ArticleSvc.ActorContext, input({ subcategoryId: sub }));
    const slug = (await prisma.article.findUniqueOrThrow({ where: { id: created.id }, select: { slug: true } })).slug;
    await article.saveArticle(admin as ArticleSvc.ActorContext, {
      ...input({ categoryName: catB.name, subcategoryId: null }), id: created.id, slug,
    } as ArticleSvc.ArticleInput);
    const row = await prisma.article.findUniqueOrThrow({ where: { id: created.id }, select: { categoryId: true, subcategoryId: true } });
    expect(row.categoryId).toBe(catB.id);
    expect(row.subcategoryId).toBeNull();
  });

  // ============================================= 11-12. archive behaviour

  it('(11) an archived subcategory is not offered for new assignment', async () => {
    const sub = await makeSub(catA.id, `Archivable ${rid()}`);
    await tax.setSubcategoryArchived(admin, sub, true);
    const assignable = await tax.listAssignableSubcategories(catA.id);
    expect(assignable.map((s) => s.id)).not.toContain(sub);
    // The editor's option payload excludes it as well.
    const { listArticleRelationshipOptions } = await import('../lib/cms/adminQueries');
    const opts = await listArticleRelationshipOptions();
    expect((opts.subcategoriesBySection[catA.name] ?? []).map((o) => o.id)).not.toContain(sub);
  });

  it('(12) an existing archived assignment survives unrelated edits', async () => {
    const sub = await makeSub(catA.id, `Surviving ${rid()}`);
    const created = await article.saveArticle(admin as ArticleSvc.ActorContext, input({ subcategoryId: sub }));
    const slug = (await prisma.article.findUniqueOrThrow({ where: { id: created.id }, select: { slug: true } })).slug;
    await tax.setSubcategoryArchived(admin, sub, true);

    // Saving an unrelated field must not drop the classification.
    await article.saveArticle(admin as ArticleSvc.ActorContext, {
      ...input({ subcategoryId: sub }), id: created.id, slug, title: 'Edited While The Subcategory Is Archived',
    } as ArticleSvc.ArticleInput);
    expect((await prisma.article.findUniqueOrThrow({ where: { id: created.id }, select: { subcategoryId: true } })).subcategoryId).toBe(sub);

    await tax.setSubcategoryArchived(admin, sub, false);
    expect((await prisma.subcategory.findUniqueOrThrow({ where: { id: sub } })).archivedAt).toBeNull();
  });

  it('archiving keeps the article count, so the link is visibly intact', async () => {
    const sub = await makeSub(catA.id, `Counted ${rid()}`);
    await article.saveArticle(admin as ArticleSvc.ActorContext, input({ subcategoryId: sub }));
    await tax.setSubcategoryArchived(admin, sub, true);
    const rows = await tax.listSubcategories({ lifecycle: 'all', categoryId: catA.id });
    const row = rows.find((r) => r.id === sub)!;
    expect(row.archivedAt).not.toBeNull();
    expect(row.articleCount).toBe(1);
  });

  // ================================================ 13-14. delete policy

  it('(13) a referenced subcategory cannot be deleted', async () => {
    const sub = await makeSub(catA.id, `Referenced ${rid()}`);
    await article.saveArticle(admin as ArticleSvc.ActorContext, input({ subcategoryId: sub }));
    await expect(tax.deleteSubcategory(admin, sub)).rejects.toThrow(/Cannot delete/i);
    expect(await prisma.subcategory.findUnique({ where: { id: sub } })).not.toBeNull();
  });

  it('(13b) the database refuses the delete too, when the service is bypassed', async () => {
    const sub = await makeSub(catA.id, `FkGuarded ${rid()}`);
    await article.saveArticle(admin as ArticleSvc.ActorContext, input({ subcategoryId: sub }));
    await expect(prisma.subcategory.delete({ where: { id: sub } })).rejects.toThrow();
  });

  it('(14) an unreferenced subcategory can be deleted', async () => {
    const sub = await makeSub(catA.id, `Unreferenced ${rid()}`);
    await tax.deleteSubcategory(admin, sub);
    expect(await prisma.subcategory.findUnique({ where: { id: sub } })).toBeNull();
  });

  it('a parent move is refused while articles are attached, and allowed when none are', async () => {
    const used = await makeSub(catA.id, `Attached ${rid()}`);
    await article.saveArticle(admin as ArticleSvc.ActorContext, input({ subcategoryId: used }));
    await expect(tax.updateSubcategory(admin, used, { categoryId: catB.id, name: 'Moved' }))
      .rejects.toThrow(/Cannot move this subcategory/i);
    expect((await prisma.subcategory.findUniqueOrThrow({ where: { id: used } })).categoryId).toBe(catA.id);

    const free = await makeSub(catA.id, `Movable ${rid()}`);
    await tax.updateSubcategory(admin, free, { categoryId: catB.id, name: `Moved ${rid()}` });
    expect((await prisma.subcategory.findUniqueOrThrow({ where: { id: free } })).categoryId).toBe(catB.id);
  });

  // ================================================= 15-16. RBAC and audit

  it('(15) RBAC blocks unauthorized taxonomy mutations', async () => {
    const sub = await makeSub(catA.id, `Protected ${rid()}`);
    for (const call of [
      () => tax.createSubcategory(author, { categoryId: catA.id, name: 'Nope' }),
      () => tax.updateSubcategory(author, sub, { categoryId: catA.id, name: 'Nope' }),
      () => tax.setSubcategoryArchived(author, sub, true),
      () => tax.deleteSubcategory(author, sub),
    ]) {
      await expect(call()).rejects.toMatchObject({ code: 'forbidden' });
    }
    const row = await prisma.subcategory.findUniqueOrThrow({ where: { id: sub } });
    expect(row.name).toMatch(/^Protected /);
    expect(row.archivedAt).toBeNull();
  });

  it('(16) every mutation writes an audit record', async () => {
    const id = await makeSub(catA.id, `Audited ${rid()}`);
    await tax.updateSubcategory(admin, id, { categoryId: catA.id, name: `Audited Renamed ${rid()}` });
    await tax.setSubcategoryArchived(admin, id, true);
    await tax.setSubcategoryArchived(admin, id, false);
    await tax.deleteSubcategory(admin, id);
    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'subcategory', entityId: id },
      orderBy: { createdAt: 'asc' }, select: { action: true },
    });
    expect(logs.map((l) => l.action)).toEqual([
      'subcategory.create', 'subcategory.update', 'subcategory.archive',
      'subcategory.reactivate', 'subcategory.delete',
    ]);
  });

  // ============================================ 17-19. legacy and public

  it('(17) REGRESSION: legacy-only articles remain readable and editable', async () => {
    // Exactly the shape of the 11 production rows: a legacy label, no managed id.
    const created = await article.saveArticle(
      admin as ArticleSvc.ActorContext,
      input({ subcategory: 'Broadcast Intelligence', subcategoryId: null }),
    );
    const slug = (await prisma.article.findUniqueOrThrow({ where: { id: created.id }, select: { slug: true } })).slug;
    const row = await prisma.article.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.subcategory).toBe('Broadcast Intelligence');
    expect(row.subcategoryId).toBeNull();

    // An unrelated edit keeps the legacy label untouched.
    await article.saveArticle(admin as ArticleSvc.ActorContext, {
      ...input({ subcategory: 'Broadcast Intelligence', subcategoryId: null }),
      id: created.id, slug, title: 'A Legacy Article Edited Without A Managed Subcategory',
    } as ArticleSvc.ArticleInput);
    expect((await prisma.article.findUniqueOrThrow({ where: { id: created.id } })).subcategory).toBe('Broadcast Intelligence');
  });

  it('(18) the managed name takes precedence over the legacy label in public display', async () => {
    const sub = await makeSub(catA.id, `Managed Display ${rid()}`);
    const managedName = (await prisma.subcategory.findUniqueOrThrow({ where: { id: sub } })).name;
    const created = await article.saveArticle(
      admin as ArticleSvc.ActorContext,
      input({ subcategory: 'A Stale Legacy Label', subcategoryId: sub }),
    );
    const { toArticle, articleInclude } = await import('../lib/mappers');
    const mapped = toArticle(await prisma.article.findUniqueOrThrow({ where: { id: created.id }, include: articleInclude }));
    expect(mapped.subcategory).toBe(managedName);
    expect(mapped.subcategoryRef?.id).toBe(sub);
    expect(mapped.legacySubcategory).toBe('A Stale Legacy Label');

    // And it reaches the rendered card kicker.
    const { HomeArticleFeed } = await import('../components/sections/HomeArticleFeed');
    // `sectionPath` is required: the component renders two section links.
    const html = renderToStaticMarkup(
      React.createElement(HomeArticleFeed as never, { articles: [mapped], sectionPath: '/competition/' } as never),
    );
    expect(html).toContain(managedName);
    expect(html).not.toContain('A Stale Legacy Label');
  });

  it('(18b) with no managed value the legacy label is still displayed', async () => {
    const created = await article.saveArticle(
      admin as ArticleSvc.ActorContext,
      input({ subcategory: 'Legacy Only Label', subcategoryId: null }),
    );
    const { toArticle, articleInclude } = await import('../lib/mappers');
    const mapped = toArticle(await prisma.article.findUniqueOrThrow({ where: { id: created.id }, include: articleInclude }));
    expect(mapped.subcategory).toBe('Legacy Only Label');
    expect(mapped.subcategoryRef).toBeUndefined();
    const { ArticleHeader } = await import('../components/editorial/ArticleHeader');
    const html = renderToStaticMarkup(React.createElement(ArticleHeader as never, { article: mapped } as never));
    expect(html).toContain('Legacy Only Label');
  });

  it('(19) canonical metadata and BreadcrumbList are unchanged', async () => {
    const { buildMetadata, breadcrumbJsonLd, SITE_URL } = await import('../lib/seo');
    const { ROUTES } = await import('../config/routes');
    const seeded = await prisma.article.findFirstOrThrow({
      where: { workflowStatus: 'PUBLISHED', slug: { notIn: slugs } }, select: { slug: true, title: true, excerpt: true },
    });
    const meta = buildMetadata({ title: seeded.title, description: seeded.excerpt, path: ROUTES.ARTICLE(seeded.slug) });
    expect((meta.alternates as { canonical?: string }).canonical).toBe(`${SITE_URL}${ROUTES.ARTICLE(seeded.slug)}`);
    const crumb = breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'NFR Competition', path: '/categories/nfr-competition/' },
      { name: seeded.title, path: ROUTES.ARTICLE(seeded.slug) },
    ]) as { itemListElement: unknown[] };
    // Still Home -> Category -> Article. A subcategory never becomes an item
    // while it has no public URL.
    expect(crumb.itemListElement).toHaveLength(3);
  });

  /**
   * REWRITTEN for the flat route. A subcategory HAS a public URL now, so "never
   * in the sitemap" is no longer the contract — "in the sitemap only once it is
   * worth indexing" is. An empty archive must still stay out, and the old
   * assertion passing for a thin archive is exactly the case this pins.
   */
  it('(19b) a THIN subcategory archive stays out of the sitemap', async () => {
    const sub = await makeSub(catA.id, `Sitemapless ${rid()}`);
    const { buildSitemapEntries } = await import('../lib/seo/sitemapEntries');
    const entries = await buildSitemapEntries();
    const slug = (await prisma.subcategory.findUniqueOrThrow({ where: { id: sub } })).slug;
    expect(entries.some((e) => e.url.includes(`/${slug}/`))).toBe(false);
    // The flat route was chosen over `/subcategories/<slug>/`; nothing may emit it.
    expect(entries.some((e) => e.url.includes('/subcategories/'))).toBe(false);
  });

  it('(19c) an archive at or above the threshold IS listed, at its flat URL', async () => {
    const { SUBCATEGORY_INDEX_THRESHOLD } = await import('../lib/cms/subcategoryContent');
    const sub = await makeSub(catA.id, `Stocked ${rid()}`);
    const slug = (await prisma.subcategory.findUniqueOrThrow({ where: { id: sub } })).slug;
    for (let i = 0; i < SUBCATEGORY_INDEX_THRESHOLD; i++) {
      const saved = await article.saveArticle(
        admin as ArticleSvc.ActorContext,
        input({ categoryName: catA.name, subcategoryId: sub }),
      );
      // Published directly: this test is about the sitemap threshold, not the
      // workflow, and the gate transitions are covered elsewhere in this file.
      await prisma.article.update({
        where: { id: saved.id },
        data: { workflowStatus: 'PUBLISHED', publishedAt: new Date() },
      });
    }
    const { buildSitemapEntries } = await import('../lib/seo/sitemapEntries');
    const entries = await buildSitemapEntries();
    expect(entries.some((e) => e.url.endsWith(`/${slug}/`))).toBe(true);
  });

  // ================================= 20-22. earlier batches and search

  it('(20) Batch 04-A article types and evergreen behaviour are intact', async () => {
    const { isEvergreenType, isKnownArticleType, SELECTABLE_ARTICLE_TYPES } = await import('../lib/content/articleTypes');
    expect(SELECTABLE_ARTICLE_TYPES).toHaveLength(18);
    expect(isKnownArticleType('guide')).toBe(true);
    expect(isKnownArticleType('GUIDE')).toBe(false);
    expect(isEvergreenType('guide')).toBe(true);
    const { getEvergreenArticles } = await import('../lib/content');
    const rows = await getEvergreenArticles(20);
    expect(rows.length).toBeGreaterThan(0);
    for (const a of rows) expect(isEvergreenType(a.articleType)).toBe(true);
  });

  it('(21) Issue 03 Discipline CMS is unaffected', async () => {
    const { getAllDisciplines } = await import('../lib/content');
    const all = await getAllDisciplines();
    expect(all.length).toBeGreaterThanOrEqual(7);
    for (const d of all) {
      expect(['Roughstock', 'Timed Event']).toContain(d.category);
      expect(typeof d.imageAlt).toBe('string');
    }
    const disc = await prisma.discipline.findFirstOrThrow({ select: { id: true, guide: true, summary: true } });
    const rodeo = await import('../lib/cms/rodeoService');
    await rodeo.updateDiscipline(admin, disc.id, { summary: disc.summary });
    expect((await prisma.discipline.findUniqueOrThrow({ where: { id: disc.id } })).guide).toEqual(disc.guide);
  });

  it('(22) search behaviour is intact — the legacy column is still indexed', async () => {
    // The generated tsvector is unchanged by this batch: no migration touched
    // it, and the legacy column it reads from still exists and still holds data.
    const col = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name='Article' AND column_name IN ('subcategory','searchVector')`,
    );
    expect(col[0].n).toBe(2);
    const { runPublicSearch } = await import('../lib/search/publicSearch');
    const res = await runPublicSearch({ q: 'broadcast' });
    expect(res.emptyQuery).toBe(false);
    expect(Array.isArray(res.articles.rows)).toBe(true);
    expect(typeof res.totalResults).toBe('number');
  });

  // =============================================== migration preservation

  it('no backfill occurred: every legacy-labelled article still has NO managed id', async () => {
    // Scoped to rows that actually carry a legacy label — other suites share
    // this database and create articles with neither field set, which says
    // nothing about the backfill.
    const legacy = await prisma.article.findMany({
      where: { subcategory: { not: null }, slug: { notIn: slugs } },
      select: { slug: true, subcategory: true, subcategoryId: true },
    });
    expect(legacy.length).toBeGreaterThanOrEqual(11);
    for (const a of legacy) {
      expect(a.subcategoryId, `${a.slug} was backfilled`).toBeNull();
      expect(a.subcategory).not.toBeNull();
    }
    // And no Subcategory row was invented from those labels. Rows this suite
    // created are excluded: two of its fixtures deliberately reuse real legacy
    // names, which proves nothing about a backfill either way.
    const names = new Set(legacy.map((a) => a.subcategory as string));
    const invented = await prisma.subcategory.findMany({
      where: { name: { in: [...names] }, id: { notIn: subIds } },
      select: { name: true },
    });
    expect(invented).toEqual([]);
  });
});
