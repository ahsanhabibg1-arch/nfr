import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient, EntitySeo, InfoPage } from '@prisma/client';

/**
 * Batch S / S4 — sitemap through the shared policy, against the ISOLATED test DB
 * (vitest.config forces DATABASE_URL to the test database; self-skips without one).
 * All rows use the `s4test-` prefix; pre-existing rows touched (section EntitySeo, the
 * 'corrections' InfoPage, section categories) are backed up and restored.
 */

let prisma: PrismaClient;
let available = false;
let sm: typeof import('../lib/seo/sitemapEntries');
let SITE_URL = '';
if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    sm = await import('../lib/seo/sitemapEntries');
    SITE_URL = (await import('../lib/seo')).SITE_URL;
    available = true;
  } catch { available = false; }
}
const suite = available ? describe : describe.skip;

const P = 's4test-';
const SECTION_IDS = ['competition', 'entertainment', 'events-shopping', 'plan-watch', 'rodeo-events'];

suite('S4 — sitemap eligibility per content type (isolated test DB)', () => {
  const ids: Record<string, string> = {};
  let sectionSeoBackup: EntitySeo[] = [];
  let infoBackup: InfoPage | null = null;
  let createdPlanCategory = false;
  let result: Awaited<ReturnType<typeof run>>;

  async function run() {
    const ev = sm.evaluateSitemap(await sm.loadSitemapCandidates(), SITE_URL);
    const included = new Map(ev.entries.map((e) => [e.url.replace(SITE_URL, ''), e]));
    const excluded = new Map(ev.excluded.map((x) => [x.candidate.subject.path, x.reason]));
    return { included, excluded };
  }

  beforeAll(async () => {
    sectionSeoBackup = await prisma.entitySeo.findMany({ where: { entityType: 'SECTION', entityId: { in: SECTION_IDS } } });
    await prisma.entitySeo.deleteMany({ where: { entityType: 'SECTION', entityId: { in: SECTION_IDS } } });
    infoBackup = await prisma.infoPage.findUnique({ where: { slug: 'corrections' } });

    const cat = await prisma.category.create({ data: { slug: `${P}cat`, name: `${P}Category` } });
    const author = await prisma.author.create({ data: { slug: `${P}author`, name: 'S4 Author', role: 'Writer' } });
    ids.cat = cat.id; ids.author = author.id;
    const art = (slug: string, robots: string, canonicalUrl: string | null, status: 'PUBLISHED' | 'DRAFT' = 'PUBLISHED') =>
      prisma.article.create({ data: {
        slug: `${P}${slug}`, title: slug, excerpt: 'x', articleType: 'Analysis', authorId: author.id, categoryId: cat.id,
        workflowStatus: status, publishedAt: status === 'PUBLISHED' ? new Date('2026-10-01T00:00:00Z') : null,
        seo: { create: { robots, canonicalUrl } },
      } });
    const ok = await art('a-ok', 'index, follow', null);
    ids.articleOk = ok.id;
    await art('a-noindex-follow', 'noindex, follow', null);
    await art('a-noindex-nofollow', 'noindex, nofollow', null);
    await art('a-index-nofollow', 'index, nofollow', null);
    await art('a-canon-away', 'index, follow', `${SITE_URL}/articles/${P}a-ok/`);
    await art('a-canon-self', 'index, follow', `${SITE_URL}/articles/${P}a-canon-self/`);
    await art('a-draft', 'index, follow', null, 'DRAFT');

    const evDesc = await prisma.rodeoEvent.create({ data: { slug: `${P}ev-desc`, name: 'Ev', description: 'Has a description.' } });
    await prisma.rodeoEvent.create({ data: { slug: `${P}ev-thin`, name: 'Thin' } });
    const evNoindex = await prisma.rodeoEvent.create({ data: { slug: `${P}ev-noindex`, name: 'NI', description: 'd' } });
    const edOk = await prisma.rodeoEventEdition.create({ data: { eventId: evDesc.id, editionSlug: '2026', label: '2026' } });
    const edNoindex = await prisma.rodeoEventEdition.create({ data: { eventId: evDesc.id, editionSlug: '2027', label: '2027' } });
    const hubEmpty = await prisma.rodeoHub.create({ data: { slug: `${P}hub-empty`, title: 'Empty hub' } });
    const hubFull = await prisma.rodeoHub.create({ data: { slug: `${P}hub-full`, title: 'Full hub' } });
    const hubNoindex = await prisma.rodeoHub.create({ data: { slug: `${P}hub-noindex`, title: 'NI hub' } });
    const hubAway = await prisma.rodeoHub.create({ data: { slug: `${P}hub-away`, title: 'Away hub' } });
    for (const h of [hubFull, hubNoindex, hubAway]) await prisma.rodeoHubEvent.create({ data: { hubId: h.id, eventId: evDesc.id } });
    const dOk = await prisma.discipline.create({ data: { slug: `${P}d-ok`, name: 'D ok', summary: 's' } });
    const dNoindex = await prisma.discipline.create({ data: { slug: `${P}d-noindex`, name: 'D ni', summary: 's' } });
    const dAway = await prisma.discipline.create({ data: { slug: `${P}d-away`, name: 'D away', summary: 's' } });
    Object.assign(ids, { evDesc: evDesc.id, edOk: edOk.id, hubEmpty: hubEmpty.id, dOk: dOk.id });

    // Section-archive category used for the CATEGORY EntitySeo case.
    let planCat = await prisma.category.findUnique({ where: { slug: 'nfr-plan-watch' } });
    if (!planCat) { planCat = await prisma.category.create({ data: { slug: 'nfr-plan-watch', name: 'NFR Plan & Watch' } }); createdPlanCategory = true; }
    ids.planCat = planCat.id;

    await prisma.entitySeo.createMany({ data: [
      { entityType: 'RODEO_EVENT', entityId: evNoindex.id, noindex: true },
      { entityType: 'RODEO_EDITION', entityId: edNoindex.id, noindex: true },
      { entityType: 'RODEO_HUB', entityId: hubNoindex.id, noindex: true },
      { entityType: 'RODEO_HUB', entityId: hubAway.id, canonicalOverride: '/rodeo-events/somewhere-else/' },
      { entityType: 'DISCIPLINE', entityId: dNoindex.id, noindex: true },
      { entityType: 'DISCIPLINE', entityId: dAway.id, canonicalOverride: '/disciplines/bull-riding/' },
      { entityType: 'CATEGORY', entityId: planCat.id, noindex: true },
      { entityType: 'SECTION', entityId: 'entertainment', noindex: true },
      { entityType: 'SECTION', entityId: 'events-shopping', canonicalOverride: '/competition/' },
      { entityType: 'SECTION', entityId: 'plan-watch', seoTitle: 'Title only — still indexable' },
    ] });

    await prisma.infoPage.upsert({
      where: { slug: 'corrections' },
      create: { slug: 'corrections', title: 'Corrections', body: '<p>x</p>', status: 'PUBLISHED' },
      update: { status: 'PUBLISHED' },
    });

    result = await run();
  });

  afterAll(async () => {
    if (!available) return;
    const ents = await prisma.entitySeo.findMany({ select: { id: true, entityType: true, entityId: true } });
    const ours = new Set<string>();
    const hubs = await prisma.rodeoHub.findMany({ where: { slug: { startsWith: P } }, select: { id: true } });
    const evs = await prisma.rodeoEvent.findMany({ where: { slug: { startsWith: P } }, select: { id: true, editions: { select: { id: true } } } });
    const ds = await prisma.discipline.findMany({ where: { slug: { startsWith: P } }, select: { id: true } });
    for (const x of [...hubs, ...evs, ...evs.flatMap((e) => e.editions), ...ds]) ours.add(x.id);
    ours.add(ids.planCat);
    await prisma.entitySeo.deleteMany({ where: { id: { in: ents.filter((e) => ours.has(e.entityId) || (e.entityType === 'SECTION' && SECTION_IDS.includes(e.entityId))).map((e) => e.id) } } });
    for (const { id: _id, ...row } of sectionSeoBackup) await prisma.entitySeo.create({ data: row });
    await prisma.rodeoHubEvent.deleteMany({ where: { hubId: { in: hubs.map((h) => h.id) } } });
    await prisma.rodeoEventEdition.deleteMany({ where: { eventId: { in: evs.map((e) => e.id) } } });
    await prisma.rodeoEvent.deleteMany({ where: { slug: { startsWith: P } } });
    await prisma.rodeoHub.deleteMany({ where: { slug: { startsWith: P } } });
    await prisma.discipline.deleteMany({ where: { slug: { startsWith: P } } });
    await prisma.article.deleteMany({ where: { slug: { startsWith: P } } });
    await prisma.author.deleteMany({ where: { slug: { startsWith: P } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: P } } });
    if (createdPlanCategory) await prisma.category.delete({ where: { id: ids.planCat } });
    if (infoBackup) { const { id: _i, ...row } = infoBackup; await prisma.infoPage.update({ where: { slug: 'corrections' }, data: row }); }
    else await prisma.infoPage.deleteMany({ where: { slug: 'corrections' } });
  });

  const inc = (p: string) => result.included.has(p);
  const why = (p: string) => result.excluded.get(p);

  it('articles: published+indexable+self-canonical listed; noindex (either follow), canonical-away and drafts excluded', () => {
    expect(inc(`/articles/${P}a-ok/`)).toBe(true);
    expect(inc(`/articles/${P}a-canon-self/`)).toBe(true);
    expect(inc(`/articles/${P}a-index-nofollow/`)).toBe(true);
    expect(why(`/articles/${P}a-noindex-follow/`)).toBe('stored-robots-noindex');
    expect(why(`/articles/${P}a-noindex-nofollow/`)).toBe('stored-robots-noindex');
    expect(why(`/articles/${P}a-canon-away/`)).toBe('canonical-away');
    expect(inc(`/articles/${P}a-draft/`)).toBe(false);
    expect(why(`/articles/${P}a-draft/`)).toBeUndefined(); // drafts are never loaded at all
  });

  it('rodeo hubs: content rule (thin hub = noindex) + EntitySeo noindex/canonical', () => {
    expect(why(`/rodeo-events/${P}hub-empty/`)).toBe('content-noindex'); // the texas-circuit-stock-shows shape
    expect(inc(`/rodeo-events/${P}hub-full/`)).toBe(true);
    expect(why(`/rodeo-events/${P}hub-noindex/`)).toBe('editor-noindex');
    expect(why(`/rodeo-events/${P}hub-away/`)).toBe('canonical-away');
  });

  it('rodeo events & editions: content rule + EntitySeo noindex', () => {
    expect(inc(`/rodeo-events/${P}ev-desc/`)).toBe(true);
    expect(why(`/rodeo-events/${P}ev-thin/`)).toBe('content-noindex');
    expect(why(`/rodeo-events/${P}ev-noindex/`)).toBe('editor-noindex');
    expect(inc(`/rodeo-events/${P}ev-desc/2026/`)).toBe(true);
    expect(why(`/rodeo-events/${P}ev-desc/2027/`)).toBe('editor-noindex');
  });

  it('disciplines: no EntitySeo → listed; noindex and canonical-away excluded', () => {
    expect(inc(`/disciplines/${P}d-ok/`)).toBe(true);
    expect(why(`/disciplines/${P}d-noindex/`)).toBe('editor-noindex');
    expect(why(`/disciplines/${P}d-away/`)).toBe('canonical-away');
  });

  it('sections & category archives: EntitySeo SECTION/CATEGORY honoured; other sections unaffected', () => {
    expect(why('/entertainment/')).toBe('editor-noindex');
    expect(why('/events-shopping/')).toBe('canonical-away');
    expect(inc('/plan-watch/')).toBe(true); // record without noindex/canonical keeps eligibility
    expect(inc('/competition/')).toBe(true);
    expect(inc('/rodeo-events/')).toBe(true);
    expect(why('/categories/nfr-plan-watch/')).toBe('editor-noindex');
    expect(inc('/categories/nfr-competition/')).toBe(true);
  });

  it('legal pages: published DB version → listed with its updatedAt; pending config without DB → excluded', async () => {
    const info = await prisma.infoPage.findUnique({ where: { slug: 'corrections' } });
    const entry = result.included.get('/corrections/');
    expect(entry).toBeDefined();
    expect(entry!.lastModified).toEqual(info!.updatedAt);
    const hasTerms = await prisma.infoPage.findFirst({ where: { slug: 'terms', status: 'PUBLISHED' } });
    if (!hasTerms) expect(why('/terms/')).toBe('content-noindex');
  });

  it('lastModified is the real record timestamp where one exists, omitted where none exists', async () => {
    const a = await prisma.article.findUnique({ where: { id: ids.articleOk }, select: { updatedAt: true } });
    expect(result.included.get(`/articles/${P}a-ok/`)!.lastModified).toEqual(a!.updatedAt);
    expect(result.included.get(`/disciplines/${P}d-ok/`)).not.toHaveProperty('lastModified');
    expect(result.included.get(`/rodeo-events/${P}ev-desc/`)).not.toHaveProperty('lastModified');
    expect(result.included.get('/competitors/')).not.toHaveProperty('lastModified');
    // Home: newest article (ours or older) — always a real stored timestamp, never request time.
    const newest = await prisma.article.findFirst({ where: { workflowStatus: 'PUBLISHED' }, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } });
    const home = result.included.get('/')!.lastModified as Date;
    expect(home.getTime()).toBeGreaterThanOrEqual(newest!.updatedAt.getTime());
  });

  it('buildSitemapEntries returns exactly the included set', async () => {
    const urls = (await sm.buildSitemapEntries()).map((e) => e.url.replace(SITE_URL, ''));
    expect(new Set(urls)).toEqual(new Set(result.included.keys()));
  });
});
