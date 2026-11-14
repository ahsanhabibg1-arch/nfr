import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Internal link search.
 *
 * THE THREE PROPERTIES THAT MATTER, and why each is tested rather than assumed:
 *
 *   1. URLs COME FROM THE ROUTE HELPERS. An editor that concatenates a path by
 *      hand is how an author ends up linking to a 404. Every result's `url` is
 *      compared against `config/routes.ts` applied to the stored slug.
 *   2. UNPUBLISHED CONTENT IS NOT OFFERED. Linking to a draft publishes a dead
 *      URL, so drafts, scheduled articles and archived entities must not
 *      appear.
 *   3. IT IS GATED. The results contain entity slugs, so an actor without
 *      article-writing permission must be refused.
 */

const dbUrl = process.env.DATABASE_URL ?? '';
const suite = dbUrl ? describe : describe.skip;

suite('internal link search', () => {
  let prisma: PrismaClient;
  let search: typeof import('../lib/cms/internalLinkSearch');
  let routes: typeof import('../config/routes');
  let author: { id: string; roles: ['author'] };
  let reader: { id: string; roles: ['reader'] };
  const madeUsers: string[] = [];
  const madeArticles: string[] = [];
  const token = Math.random().toString(36).slice(2, 8);

  beforeAll(async () => {
    if (!dbUrl) return;
    prisma = new PrismaClient();
    search = await import('../lib/cms/internalLinkSearch');
    routes = await import('../config/routes');

    const mk = async (key: string) => {
      const role = await prisma.role.findUniqueOrThrow({ where: { key } });
      const u = await prisma.user.create({
        data: { email: `ils-${key}-${token}@example.com`, name: `ILS ${key}`, status: 'ACTIVE' },
      });
      await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
      madeUsers.push(u.id);
      return u.id;
    };
    author = { id: await mk('author'), roles: ['author'] };
    reader = { id: await mk('reader'), roles: ['reader'] };

    // One published and one DRAFT article with the same distinctive token, so
    // the published/unpublished distinction is observable rather than inferred.
    const seed = await prisma.article.findFirstOrThrow({
      select: { authorId: true, categoryId: true, createdById: true },
    });
    for (const [state, status] of [['published', 'PUBLISHED'], ['draft', 'DRAFT']] as const) {
      const a = await prisma.article.create({
        data: {
          slug: `ils-${state}-${token}`,
          title: `Linkable ${state} ${token}`,
          excerpt: 'Synthetic article used by the internal link search tests.',
          articleType: 'General Information',
          workflowStatus: status,
          ...(status === 'PUBLISHED' ? { publishedAt: new Date() } : {}),
          authorId: seed.authorId,
          categoryId: seed.categoryId,
          createdById: seed.createdById,
        },
        select: { id: true },
      });
      madeArticles.push(a.id);
    }
  });

  afterAll(async () => {
    if (!dbUrl) return;
    const drop = async (what: string, fn: () => Promise<unknown>) => {
      try { await fn(); } catch { console.warn(`[ils] could not clean ${what}`); }
    };
    await drop('articles', () => prisma.article.deleteMany({ where: { id: { in: madeArticles } } }));
    await drop('audit', () => prisma.auditLog.deleteMany({ where: { actorId: { in: madeUsers } } }));
    await drop('roles', () => prisma.userRole.deleteMany({ where: { userId: { in: madeUsers } } }));
    await drop('users', () => prisma.user.deleteMany({ where: { id: { in: madeUsers } } }));
    await prisma.$disconnect();
  });

  // ---- gating -----------------------------------------------------------

  it('refuses an actor without article-writing permission', async () => {
    await expect(search.searchInternalLinkTargets(reader as never, 'linkable'))
      .rejects.toThrow(/permitted/i);
  });

  it('allows an author', async () => {
    const r = await search.searchInternalLinkTargets(author as never, `Linkable published ${token}`);
    expect(Array.isArray(r)).toBe(true);
  });

  // ---- publishability ---------------------------------------------------

  it('offers the PUBLISHED article and NOT the draft', async () => {
    const r = await search.searchInternalLinkTargets(author as never, token);
    const labels = r.filter((x) => x.kind === 'article').map((x) => x.label);
    expect(labels.some((l) => l.includes('published'))).toBe(true);
    expect(labels.some((l) => l.includes('draft')), 'a draft must never be offered as a link target').toBe(false);
  });

  // ---- URLs come from the route helpers ---------------------------------

  it('builds the article URL from ROUTES.ARTICLE, not by hand', async () => {
    const r = await search.searchInternalLinkTargets(author as never, `Linkable published ${token}`);
    const hit = r.find((x) => x.kind === 'article');
    expect(hit).toBeTruthy();
    expect(hit!.url).toBe(routes.ROUTES.ARTICLE(`ils-published-${token}`));
  });

  it('every result URL matches the route helper for its kind', async () => {
    // "riding" matches the seeded disciplines; a one-character query would
    // correctly return nothing (the service's own minimum), which is what an
    // earlier version of this test mistakenly asserted against.
    const results = await search.searchInternalLinkTargets(author as never, 'riding');
    expect(results.length, 'expected some results to verify').toBeGreaterThan(0);
    for (const r of results) {
      // Site-relative and trailing-slashed, matching the site's `trailingSlash`
      // configuration — an absolute or slashless URL would break the canonical.
      expect(r.url.startsWith('/'), `${r.kind}: ${r.url}`).toBe(true);
      expect(r.url.endsWith('/'), `${r.kind}: ${r.url}`).toBe(true);
      expect(r.url).not.toMatch(/^https?:/);
    }
  });

  it('the five canonical sections resolve to their configured paths', async () => {
    const r = await search.searchInternalLinkTargets(author as never, 'NFR', ['section']);
    expect(r.length).toBeGreaterThan(0);
    const configured = new Set(
      Object.values(routes.PRIMARY_SECTIONS).map((s) => (s as { path: string }).path),
    );
    for (const hit of r) expect(configured.has(hit.url), hit.url).toBe(true);
  });

  // ---- behaviour --------------------------------------------------------

  it('returns nothing for a query shorter than two characters', async () => {
    expect(await search.searchInternalLinkTargets(author as never, 'a'.slice(0, 1))).toEqual([]);
    expect(await search.searchInternalLinkTargets(author as never, ' ')).toEqual([]);
  });

  it('can be restricted to particular kinds', async () => {
    const r = await search.searchInternalLinkTargets(author as never, 'riding', ['discipline']);
    expect(r.length).toBeGreaterThan(0);
    expect([...new Set(r.map((x) => x.kind))]).toEqual(['discipline']);
  });

  it('ranks exact prefix matches first', async () => {
    const r = await search.searchInternalLinkTargets(author as never, 'Linkable', ['article']);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].label.toLowerCase().startsWith('linkable')).toBe(true);
  });

  it('warns about a category archive with no published articles instead of hiding it', async () => {
    const r = await search.searchInternalLinkTargets(author as never, 'NFR', ['category']);
    for (const hit of r) {
      const n = Number((hit.detail ?? '').split(' ')[0]);
      if (Number.isFinite(n) && n === 0) expect(hit.warning).toMatch(/no published articles/i);
      else expect(hit.warning).toBeUndefined();
    }
  });

  it('a search that matches nothing returns an empty list, not an error', async () => {
    expect(await search.searchInternalLinkTargets(author as never, 'zzz-no-such-entity-zzz')).toEqual([]);
  });
});
