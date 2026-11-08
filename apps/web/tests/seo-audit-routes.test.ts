import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';

/**
 * Batch S / S6 — the audit engine's inventory against the ISOLATED test DB (vitest.config
 * forces DATABASE_URL to the test database; self-skips without one). Rows use `s6test-`.
 * Verifies the real buildInventory → route index → analyzers path, and that inventory
 * query count does not grow with the number of articles (no N+1).
 */

let prisma: PrismaClient;
let available = false;
let orch: typeof import('../lib/seo-intel/orchestrator');
let an: typeof import('../lib/seo-intel/analyzers');
let ri: typeof import('../lib/seo/routeIndex');
if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    orch = await import('../lib/seo-intel/orchestrator');
    an = await import('../lib/seo-intel/analyzers');
    ri = await import('../lib/seo/routeIndex');
    available = true;
  } catch { available = false; }
}
const suite = available ? describe : describe.skip;
const P = 's6test-';

suite('S6 — audit inventory, route index and findings (isolated test DB)', () => {
  let inv: Awaited<ReturnType<typeof orch.buildInventory>>;
  const ids: Record<string, string> = {};

  async function cleanup() {
    const evs = await prisma.rodeoEvent.findMany({ where: { slug: { startsWith: P } }, select: { id: true } });
    await prisma.rodeoEventEdition.deleteMany({ where: { eventId: { in: evs.map((e) => e.id) } } });
    await prisma.rodeoEvent.deleteMany({ where: { slug: { startsWith: P } } });
    await prisma.venue.deleteMany({ where: { slug: { startsWith: P } } });
    await prisma.article.deleteMany({ where: { slug: { startsWith: P } } });
    await prisma.author.deleteMany({ where: { slug: { startsWith: P } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: P } } });
  }

  beforeAll(async () => {
    await cleanup();
    const cat = await prisma.category.create({ data: { slug: `${P}cat`, name: `${P}Category` } });
    const author = await prisma.author.create({ data: { slug: `${P}author`, name: 'S6', role: 'Writer' } });
    const mk = (slug: string, status: 'PUBLISHED' | 'DRAFT', robots: string, blocks: object[] = []) =>
      prisma.article.create({ data: {
        slug: `${P}${slug}`, title: slug, excerpt: 'x', articleType: 'Analysis', authorId: author.id, categoryId: cat.id,
        workflowStatus: status, publishedAt: status === 'PUBLISHED' ? new Date('2026-10-01T00:00:00Z') : null,
        seo: { create: { robots, canonicalUrl: `https://nfrguide.com/articles/${P}${slug}/` } },
        blocks: { create: blocks.map((data, i) => ({ sortOrder: i, blockType: (data as { type: string }).type, data })) },
      } });
    await mk('live', 'PUBLISHED', 'index, follow');
    await mk('noindexed', 'PUBLISHED', 'noindex, follow');
    await mk('draft', 'DRAFT', 'index, follow');
    const ev = await prisma.rodeoEvent.create({ data: { slug: `${P}ev`, name: 'S6 Event', description: 'Has a description.' } });
    await prisma.rodeoEventEdition.create({ data: { eventId: ev.id, editionSlug: '2026', label: '2026' } });
    await prisma.venue.create({ data: { slug: `${P}thin-venue`, name: 'Thin venue' } });
    const src = await mk('source', 'PUBLISHED', 'index, follow', [
      { type: 'paragraph', text: `Coverage: /rodeo-events/${P}ev/ and its schedule /rodeo-events/${P}ev/2026/schedule. Venue: /venues/${P}thin-venue/.` },
      { type: 'paragraph', text: `Also /articles/${P}noindexed and /search/?q=bull. Broken: /articles/${P}missing/. Draft: /articles/${P}draft/.` },
      { type: 'sourceLink', title: 'Our piece', url: `https://nfrguide.com/articles/${P}live/` },
      { type: 'sourceLink', title: 'External', url: `https://prca.example/articles/${P}missing-external/` },
      { type: 'sourceLink', title: 'Bad', url: 'javascript:alert(1)' },
    ]);
    ids.source = src.id;
    inv = await orch.buildInventory(prisma);
  });

  afterAll(async () => { if (available) await cleanup(); });

  it('the route index covers every family the fixtures touch, with real outcomes', () => {
    const r = (p: string) => ri.resolveRoute(inv.routes!, p).status;
    expect(r(`/articles/${P}live/`)).toBe('indexable');
    expect(r(`/articles/${P}noindexed/`)).toBe('noindex');
    expect(r(`/articles/${P}draft/`)).toBe('unpublished');
    expect(r(`/articles/${P}missing/`)).toBe('not-found');
    expect(r(`/rodeo-events/${P}ev/`)).toBe('indexable');
    expect(r(`/rodeo-events/${P}ev/2026/`)).toBe('indexable');
    expect(r(`/rodeo-events/${P}ev/2026/schedule/`)).toBe('noindex');
    expect(r(`/venues/${P}thin-venue/`)).toBe('noindex');
    expect(r('/search/')).toBe('noindex');
    expect(r('/admin/')).toBe('not-public');
    expect(inv.validPaths.has(`/rodeo-events/${P}ev/`)).toBe(true); // was missing before S6
  });

  it('extracted links: absolute URLs whole, relative paths at boundaries (no path taken from inside an external URL)', () => {
    const links = inv.articles.find((a) => a.id === ids.source)!.internalLinks;
    expect(links).toEqual(expect.arrayContaining([`https://nfrguide.com/articles/${P}live/`, `https://prca.example/articles/${P}missing-external/`, `/rodeo-events/${P}ev/`]));
    expect(links).not.toContain(`/articles/${P}missing-external/`);
  });

  it('LINK_* findings: only the genuinely missing/unsafe links are broken; the draft is "unpublished"', () => {
    const f = an.analyzeInternalLinks(inv).filter((x) => x.articleId === ids.source && x.ruleCode !== 'LINK_ORPHAN' && x.ruleCode !== 'LINK_OPPORTUNITY');
    const broken = f.filter((x) => x.ruleCode === 'LINK_BROKEN').map((x) => x.discriminator).sort();
    expect(broken).toEqual([`/articles/${P}missing/`, 'javascript:alert(1)'].sort());
    expect(f.filter((x) => x.ruleCode === 'LINK_TO_UNPUBLISHED').map((x) => x.discriminator)).toEqual([`/articles/${P}draft/`]);
  });

  it('TECH_SITEMAP_EXCLUDED: no false positives for the live and the correctly-excluded noindex article', () => {
    const f = an.analyzeTechnical(inv).filter((x) => x.ruleCode === 'TECH_SITEMAP_EXCLUDED' && String(x.affectedUrl).includes(P));
    expect(f).toEqual([]);
    expect(inv.sitemap!.urls.has(`/articles/${P}live/`)).toBe(true);
    expect(inv.sitemap!.urls.has(`/articles/${P}noindexed/`)).toBe(false);
  });

  it('inventory query count is independent of article count (no N+1)', async () => {
    const count = async () => {
      let n = 0;
      const counted = prisma.$extends({ query: { $allModels: { async $allOperations({ args, query }) { n++; return query(args); } } } });
      await orch.buildInventory(counted as unknown as PrismaClient);
      return n;
    };
    const before = await count();
    const author = await prisma.author.findFirstOrThrow({ where: { slug: `${P}author` } });
    const cat = await prisma.category.findFirstOrThrow({ where: { slug: `${P}cat` } });
    for (let i = 0; i < 5; i++) {
      await prisma.article.create({ data: { slug: `${P}extra-${i}`, title: 'x', excerpt: 'x', articleType: 'Analysis', authorId: author.id, categoryId: cat.id, workflowStatus: 'PUBLISHED', publishedAt: new Date(), blocks: { create: [{ sortOrder: 0, blockType: 'paragraph', data: { type: 'paragraph', text: `/articles/${P}live/` } }] } } });
    }
    const after = await count();
    expect(after).toBe(before);
    expect(before).toBeLessThanOrEqual(12); // queries issued through the audit's client (S4 loader is separate, also batched)
  });
});
