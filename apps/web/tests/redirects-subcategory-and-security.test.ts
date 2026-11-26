import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type * as Svc from '../lib/cms/articleService';
import type * as Repo from '../lib/content';
import type * as RodeoSlugs from '../lib/cms/rodeoSlugs';

/**
 * Stage 03 — defects D-1 and D-2, against the isolated test database.
 *
 * D-1. A published article that lives under a subcategory is addressed at
 * `/<subcategory>/<slug>/`, and that is the path `syncUrlRedirect` stores when
 * it is renamed. The resolver, however, queried `/articles/<slug>/` and
 * validated the destination with an `/articles/...`-only regular expression.
 * The old URL therefore 404'd while a correct 308 sat in the table.
 *
 * This went unnoticed because every pre-existing redirect test uses FLAT
 * article paths. A green suite proved nothing about the site's primary article
 * form, which is why these cases are written against a real subcategory
 * article rather than added to the flat ones.
 *
 * D-2. `resolveRodeoRedirect` returned whatever string was stored after a
 * single self-check — no internal-path check, no liveness check — while the
 * article resolver checked both. These cases pin the destination validation
 * that closes it, using rows written DIRECTLY to the table, because the point
 * is that a row the services did not write must still be refused.
 */

let prisma: PrismaClient;
let svc: typeof Svc;
let repo: typeof Repo;
let rodeo: typeof RodeoSlugs;
let available = false;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    svc = await import('../lib/cms/articleService');
    repo = await import('../lib/content');
    rodeo = await import('../lib/cms/rodeoSlugs');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
    available = (await prisma.category.count()) > 0;
  } catch {
    available = false;
  }
}

const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 9);
const TAG = 's03r';

suite('Stage 03 — subcategory article redirects (D-1)', () => {
  let admin: Svc.ActorContext;
  let subSlug: string;
  let categoryName: string;
  let subcategoryId: string;

  const input = (over: Partial<Svc.ArticleInput> = {}): Svc.ArticleInput => ({
    slug: `${TAG}-${rid()}`,
    title: 'Stage Three Redirect Coverage Headline',
    excerpt: 'A valid editorial excerpt that is long enough to satisfy the publication gate checks.',
    blocks: [
      { type: 'paragraph', text: 'Opening paragraph with a reasonable number of words for the gate.' },
      { type: 'heading', level: 2, text: 'A Section Heading' },
    ],
    categoryName,
    authorName: 'Stage 3 Tester',
    imageRightsStatus: 'Staff Photo',
    imageAltText: 'A descriptive alt text for the featured test photograph.',
    ...over,
  });

  async function publish(id: string): Promise<number> {
    let v = (await prisma.article.findUniqueOrThrow({ where: { id } })).version;
    for (const t of ['IN_REVIEW', 'APPROVED', 'PUBLISHED'] as const) v = (await svc.transitionWorkflow(admin, id, t, v)).version;
    return v;
  }

  beforeAll(async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'super_admin' } });
    const user = await prisma.user.create({ data: { email: `${TAG}-${rid()}@example.com`, name: 'S3', status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    admin = { id: user.id, roles: ['super_admin'] as Svc.ActorContext['roles'] };

    // The test database ships no subcategories, so the fixture makes one.
    const cat = await prisma.category.findFirstOrThrow({ select: { id: true, name: true } });
    categoryName = cat.name;
    subSlug = `${TAG}-sub-${rid()}`;
    const sub = await prisma.subcategory.create({
      data: { categoryId: cat.id, name: `Stage 3 Sub ${rid()}`, slug: subSlug },
      select: { id: true },
    });
    subcategoryId = sub.id;
  });

  afterAll(async () => {
    if (!available) return;
    await prisma.articleRedirect.deleteMany({ where: { OR: [{ sourcePath: { contains: TAG } }, { targetPath: { contains: TAG } }] } });
    await prisma.article.deleteMany({ where: { slug: { startsWith: `${TAG}-` } } });
    await prisma.subcategory.deleteMany({ where: { slug: { startsWith: `${TAG}-sub-` } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: `${TAG}-` } } });
  });

  it('THE DEFECT: renaming a subcategory article resolves its old URL to the new one', async () => {
    const a = await svc.saveArticle(admin, input({ subcategoryId }));
    await publish(a.id);
    const oldPath = `/${subSlug}/${a.slug}/`;

    const newSlug = `${TAG}-renamed-${rid()}`;
    const res = await svc.saveArticle(admin, input({ id: a.id, slug: newSlug, subcategoryId }));
    expect(res.redirectCreated, 'the write path must still record the move').toBe(true);

    // The row was always written correctly; before the fix NOTHING could read it.
    const row = await prisma.articleRedirect.findUnique({ where: { sourcePath: oldPath } });
    expect(row, 'a 308 must exist at the subcategory path').toBeTruthy();
    expect(row!.statusCode).toBe(308);

    // The fix: the resolver is asked with the path a reader actually requests.
    expect(await repo.resolveArticleRedirect(oldPath)).toEqual({
      destination: `/${subSlug}/${newSlug}/`,
      permanent: true,
    });
  });

  it('still resolves a FLAT article rename, unchanged', async () => {
    const a = await svc.saveArticle(admin, input());
    await publish(a.id);
    const newSlug = `${TAG}-flat-${rid()}`;
    await svc.saveArticle(admin, input({ id: a.id, slug: newSlug }));
    expect(await repo.resolveArticleRedirect(`/articles/${a.slug}/`)).toEqual({
      destination: `/articles/${newSlug}/`,
      permanent: true,
    });
  });

  it('redirects a flat URL to the subcategory URL when an article moves into one', async () => {
    const a = await svc.saveArticle(admin, input());
    await publish(a.id);
    await svc.saveArticle(admin, input({ id: a.id, slug: a.slug, subcategoryId }));
    expect(await repo.resolveArticleRedirect(`/articles/${a.slug}/`)).toEqual({
      destination: `/${subSlug}/${a.slug}/`,
      permanent: true,
    });
  });

  it('redirects a subcategory URL back to the flat URL when the subcategory is cleared', async () => {
    const a = await svc.saveArticle(admin, input({ subcategoryId }));
    await publish(a.id);
    const oldPath = `/${subSlug}/${a.slug}/`;
    await svc.saveArticle(admin, input({ id: a.id, slug: a.slug, subcategoryId: null }));
    expect(await repo.resolveArticleRedirect(oldPath)).toEqual({
      destination: `/articles/${a.slug}/`,
      permanent: true,
    });
  });

  it('handles slug and subcategory changing together in one save', async () => {
    const a = await svc.saveArticle(admin, input());
    await publish(a.id);
    const newSlug = `${TAG}-both-${rid()}`;
    await svc.saveArticle(admin, input({ id: a.id, slug: newSlug, subcategoryId }));
    expect((await repo.resolveArticleRedirect(`/articles/${a.slug}/`))?.destination).toBe(`/${subSlug}/${newSlug}/`);
  });

  it('collapses a repeated rename to ONE hop, not a chain', async () => {
    const a = await svc.saveArticle(admin, input({ subcategoryId }));
    await publish(a.id);
    const p0 = `/${subSlug}/${a.slug}/`;
    const s1 = `${TAG}-h1-${rid()}`;
    const s2 = `${TAG}-h2-${rid()}`;
    await svc.saveArticle(admin, input({ id: a.id, slug: s1, subcategoryId }));
    await svc.saveArticle(admin, input({ id: a.id, slug: s2, subcategoryId }));

    // Both historical sources land directly on the current URL.
    expect((await repo.resolveArticleRedirect(p0))?.destination).toBe(`/${subSlug}/${s2}/`);
    expect((await repo.resolveArticleRedirect(`/${subSlug}/${s1}/`))?.destination).toBe(`/${subSlug}/${s2}/`);
  });

  it('reclaims a canonical path: a reused slug stops redirecting', async () => {
    const a = await svc.saveArticle(admin, input({ subcategoryId }));
    await publish(a.id);
    const original = a.slug;
    const p0 = `/${subSlug}/${original}/`;
    await svc.saveArticle(admin, input({ id: a.id, slug: `${TAG}-away-${rid()}`, subcategoryId }));
    expect(await repo.resolveArticleRedirect(p0)).toBeTruthy();

    // Move back: the article owns the path again, so it must not redirect away from itself.
    await svc.saveArticle(admin, input({ id: a.id, slug: original, subcategoryId }));
    expect(await repo.resolveArticleRedirect(p0)).toBeNull();
  });

  it('refuses a redirect whose destination is no longer published', async () => {
    const a = await svc.saveArticle(admin, input({ subcategoryId }));
    await publish(a.id);
    const oldPath = `/${subSlug}/${a.slug}/`;
    const newSlug = `${TAG}-unpub-${rid()}`;
    const res = await svc.saveArticle(admin, input({ id: a.id, slug: newSlug, subcategoryId }));
    expect(await repo.resolveArticleRedirect(oldPath)).toBeTruthy();

    // Take the destination out of public view; the redirect must stop resolving
    // rather than send a reader to a 404.
    await prisma.article.update({ where: { id: res.id }, data: { workflowStatus: 'DRAFT' } });
    expect(await repo.resolveArticleRedirect(oldPath)).toBeNull();
  });

  it('refuses a redirect whose destination was deleted', async () => {
    const src = `/${subSlug}/${TAG}-gone-${rid()}/`;
    await prisma.articleRedirect.create({
      data: { sourcePath: src, targetPath: `/${subSlug}/${TAG}-never-existed-${rid()}/`, statusCode: 308 },
    });
    expect(await repo.resolveArticleRedirect(src)).toBeNull();
  });

  it('heals a STALE destination into one hop instead of two', async () => {
    /*
      A row written before the destination moved again. The stored target is a
      path the article no longer uses; resolving it must land on where the
      article actually is now, not on another redirect.
    */
    const a = await svc.saveArticle(admin, input({ subcategoryId }));
    await publish(a.id);
    const moved = `${TAG}-moved-${rid()}`;
    await svc.saveArticle(admin, input({ id: a.id, slug: moved, subcategoryId }));

    const stale = `/${subSlug}/${TAG}-stale-${rid()}/`;
    await prisma.articleRedirect.create({
      data: { sourcePath: stale, targetPath: `/articles/${moved}/`, statusCode: 308 },
    });
    // Stored target says the flat path; the article actually lives under the subcategory.
    expect((await repo.resolveArticleRedirect(stale))?.destination).toBe(`/${subSlug}/${moved}/`);
  });

  it('ignores a DISABLED row', async () => {
    const src = `/${subSlug}/${TAG}-disabled-${rid()}/`;
    const a = await svc.saveArticle(admin, input({ subcategoryId }));
    await publish(a.id);
    await prisma.articleRedirect.create({
      data: { sourcePath: src, targetPath: `/${subSlug}/${a.slug}/`, statusCode: 308, status: 'DISABLED' },
    });
    expect(await repo.resolveArticleRedirect(src)).toBeNull();
  });

  it('refuses an off-site destination even on a subcategory source', async () => {
    const src = `/${subSlug}/${TAG}-ext-${rid()}/`;
    await prisma.articleRedirect.create({ data: { sourcePath: src, targetPath: 'https://evil.example/', statusCode: 308 } });
    expect(await repo.resolveArticleRedirect(src)).toBeNull();
  });
});

suite('Stage 03 — rodeo redirect destination validation (D-2)', () => {
  let liveDisciplineSlug: string;
  const made: string[] = [];

  async function row(target: string, statusCode = 308): Promise<string> {
    const src = `/disciplines/${TAG}-src-${rid()}/`;
    await prisma.articleRedirect.create({ data: { sourcePath: src, targetPath: target, statusCode } });
    made.push(src);
    return src;
  }

  beforeAll(async () => {
    liveDisciplineSlug = (await prisma.discipline.findFirstOrThrow({ select: { slug: true } })).slug;
  });

  afterAll(async () => {
    if (!available) return;
    await prisma.articleRedirect.deleteMany({ where: { sourcePath: { in: made } } });
  });

  it('still resolves a VALID rodeo destination', async () => {
    const src = await row(`/disciplines/${liveDisciplineSlug}/`);
    expect(await rodeo.resolveRodeoRedirect(src)).toEqual({
      destination: `/disciplines/${liveDisciplineSlug}/`,
      permanent: true,
    });
  });

  it('THE DEFECT: refuses an external destination', async () => {
    for (const target of [
      'https://evil.example/',
      'http://evil.example/',
      '//evil.example/',
      'javascript:alert(1)',
      'data:text/html,<script>1</script>',
      '\\\\evil.example\\share',
      '/\\evil.example/',
    ]) {
      const src = await row(target);
      expect(await rodeo.resolveRodeoRedirect(src), target).toBeNull();
    }
  });

  it('refuses a destination that does not exist (dangling)', async () => {
    const src = await row(`/disciplines/${TAG}-no-such-${rid()}/`);
    expect(await rodeo.resolveRodeoRedirect(src)).toBeNull();
  });

  it('refuses a reserved infrastructure destination', async () => {
    for (const target of ['/admin/', '/api/health/', '/_next/static/chunk.js', '/robots.txt']) {
      const src = await row(target);
      expect(await rodeo.resolveRodeoRedirect(src), target).toBeNull();
    }
  });

  it('refuses an unsupported status code', async () => {
    const src = await row(`/disciplines/${liveDisciplineSlug}/`, 404);
    expect(await rodeo.resolveRodeoRedirect(src)).toBeNull();
  });

  it('refuses a self-redirect however it is spelled', async () => {
    const src = `/disciplines/${TAG}-self-${rid()}/`;
    await prisma.articleRedirect.create({ data: { sourcePath: src, targetPath: src, statusCode: 308 } });
    made.push(src);
    expect(await rodeo.resolveRodeoRedirect(src)).toBeNull();
  });

  it('refuses an encoded-separator destination', async () => {
    const src = await row('/disciplines/a%2F..%2Fadmin/');
    expect(await rodeo.resolveRodeoRedirect(src)).toBeNull();
  });

  it('carries the temporary flag through for a 307', async () => {
    const src = await row(`/disciplines/${liveDisciplineSlug}/`, 307);
    expect(await rodeo.resolveRodeoRedirect(src)).toEqual({
      destination: `/disciplines/${liveDisciplineSlug}/`,
      permanent: false,
    });
  });
});
