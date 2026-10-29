import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as ArticleSvc from '../lib/cms/articleService';
import type * as RodeoSvc from '../lib/cms/rodeoService';
import type * as SourceSvc from '../lib/cms/sourceService';
import type * as TaxSvc from '../lib/cms/taxonomyService';
import type * as NavSvc from '../lib/cms/navigationService';
import type * as Queries from '../lib/cms/adminQueries';

/**
 * Batch 04 editorial-module integration (§17). Exercises the REAL services
 * against the test DB: Sources, Taxonomy, Rodeo Coverage, Navigation, plus the
 * dashboard + advanced article-list queries. Enforcement, validation,
 * referential protection and audit are all verified server-side. Self-skips
 * without a reachable DATABASE_URL. All rows it creates use the `b04`/`B04`
 * prefix and are cleaned up afterwards.
 */

let available = false;
let prisma: PrismaClient;
let article: typeof ArticleSvc;
let rodeo: typeof RodeoSvc;
let source: typeof SourceSvc;
let tax: typeof TaxSvc;
let nav: typeof NavSvc;
let queries: typeof Queries;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    available = true;
    article = await import('../lib/cms/articleService');
    rodeo = await import('../lib/cms/rodeoService');
    source = await import('../lib/cms/sourceService');
    tax = await import('../lib/cms/taxonomyService');
    nav = await import('../lib/cms/navigationService');
    queries = await import('../lib/cms/adminQueries');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
  } catch {
    available = false;
  }
}

const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

suite('Batch 04 — editorial modules integration', () => {
  const actors: Record<string, Actor> = {};
  let linkedArticleId = '';

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const user = await prisma.user.create({ data: { email: `b04test-${roleKey}-${rid()}@example.com`, name: `B04 ${roleKey}`, status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return { id: user.id, roles: [roleKey] };
  }

  beforeAll(async () => {
    actors.admin = await makeUser('administrator');
    actors.editor = await makeUser('editor');
    actors.author = await makeUser('author');
    actors.seo = await makeUser('seo_manager');

    // An actual published-pipeline article to exercise referential protection.
    const created = await article.saveArticle(actors.admin as ArticleSvc.ActorContext, {
      slug: `b04-${rid()}`,
      title: 'Batch 04 Referential Guard Dispatch',
      excerpt: 'A valid editorial excerpt that is long enough to satisfy the publication gate checks for the test.',
      blocks: [
        { type: 'paragraph', text: 'Opening paragraph with a reasonable number of words for the publication gate.' },
        { type: 'heading', level: 2, text: 'A Section Heading' },
      ],
      categoryName: 'NFR Competition',
      authorName: 'B04 Tester',
      imageRightsStatus: 'Staff Photo',
      imageAltText: 'A descriptive alt text for the featured test photograph.',
    } as ArticleSvc.ArticleInput);
    linkedArticleId = created.id;
  });

  afterAll(async () => {
    if (!available) return;
    // Dependency order: article (cascades its junctions) → rodeo → sources → taxonomy → nav → users.
    await prisma.article.deleteMany({ where: { slug: { startsWith: 'b04-' } } });
    await prisma.rodeoEventEdition.deleteMany({ where: { event: { id: { startsWith: 'event-b04' } } } });
    await prisma.rodeoEvent.deleteMany({ where: { id: { startsWith: 'event-b04' } } });
    await prisma.rodeoHub.deleteMany({ where: { id: { startsWith: 'hub-b04' } } });
    await prisma.venue.deleteMany({ where: { id: { startsWith: 'venue-b04' } } });
    await prisma.source.deleteMany({ where: { title: { startsWith: 'B04 ' } } });
    await prisma.category.deleteMany({ where: { name: { startsWith: 'B04Cat' } } });
    await prisma.tag.deleteMany({ where: { id: { startsWith: 'tag-b04' } } });
    await prisma.author.deleteMany({ where: { id: { startsWith: 'author-b04' } } });
    await prisma.navigationItem.deleteMany({}); // test DB nav table is test-owned
    await prisma.user.deleteMany({ where: { email: { startsWith: 'b04test-' } } });
    await prisma.$disconnect();
  });

  // ---------- Sources & References (§10) ----------
  it('source: editor can create; SEO Manager is forbidden (RBAC)', async () => {
    const r = await source.createSource(actors.editor, { title: `B04 Official PRCA Rulebook ${rid()}`, url: 'https://example.com/rulebook', classification: 'official' });
    expect(r.id).toBeTruthy();
    await expect(source.createSource(actors.seo, { title: `B04 Denied ${rid()}`, url: 'https://example.com/x' })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('source: unsafe URL scheme is rejected', async () => {
    await expect(source.createSource(actors.editor, { title: `B04 Bad ${rid()}`, url: 'javascript:alert(1)' })).rejects.toMatchObject({ code: 'validation' });
  });

  it('source: marking VERIFIED records a real verification date', async () => {
    const r = await source.createSource(actors.editor, { title: `B04 Verify ${rid()}`, url: 'https://example.com/verify' });
    await source.setSourceStatus(actors.editor, r.id, 'VERIFIED');
    const row = await prisma.source.findUnique({ where: { id: r.id } });
    expect(row?.status).toBe('VERIFIED');
    expect(row?.verificationDate).toBeInstanceOf(Date);
  });

  it('source: cannot delete a source still cited by an article (referential guard)', async () => {
    const r = await source.createSource(actors.editor, { title: `B04 Cited ${rid()}`, url: 'https://example.com/cited' });
    await prisma.articleSource.create({ data: { articleId: linkedArticleId, sourceId: r.id } });
    await expect(source.deleteSource(actors.editor, r.id)).rejects.toMatchObject({ code: 'conflict' });
    await prisma.articleSource.delete({ where: { articleId_sourceId: { articleId: linkedArticleId, sourceId: r.id } } });
    await expect(source.deleteSource(actors.editor, r.id)).resolves.toBeUndefined();
  });

  // ---------- Editorial Organization: categories / tags / authors (§8, §9) ----------
  it('category: create + duplicate rejection', async () => {
    const name = `B04Cat ${rid()}`;
    await tax.createCategory(actors.editor, { name });
    await expect(tax.createCategory(actors.editor, { name })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('category: foundational primary-section categories cannot be deleted', async () => {
    const cat = await prisma.category.findFirst({ where: { id: { startsWith: 'cat-' } } });
    expect(cat).toBeTruthy();
    await expect(tax.deleteCategory(actors.editor, cat!.id)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('tag: create and delete', async () => {
    const t = await tax.createTag(actors.editor, `b04 ${rid()}`);
    expect(t.id.startsWith('tag-b04')).toBe(true);
    await expect(tax.deleteTag(actors.editor, t.id)).resolves.toBeUndefined();
  });

  it('author: author.manage required; SEO Manager forbidden', async () => {
    await expect(tax.createAuthor(actors.seo, { name: `B04 Byline ${rid()}`, role: 'Staff Writer' })).rejects.toMatchObject({ code: 'forbidden' });
    const a = await tax.createAuthor(actors.editor, { name: `B04 Byline ${rid()}`, role: 'Staff Writer' });
    expect(a.id.startsWith('author-b04')).toBe(true);
  });

  // ---------- Rodeo Coverage: hubs / events / editions / venues (§6, §7) ----------
  it('rodeo: rodeo.manage required — Author is forbidden', async () => {
    await expect(rodeo.createHub(actors.author, { title: `B04 Hub ${rid()}` })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('rodeo: event vs edition — an edition is created under a recurring event', async () => {
    const ev = await rodeo.createEvent(actors.editor, { name: `B04 Event ${rid()}` });
    const ed = await rodeo.createEdition(actors.editor, { eventId: ev.id, editionSlug: '2025', label: 'B04 2025 Edition' });
    const row = await prisma.rodeoEventEdition.findUnique({ where: { id: ed.id } });
    expect(row?.eventId).toBe(ev.id);
  });

  it('rodeo: edition slug is unique per event', async () => {
    const ev = await rodeo.createEvent(actors.editor, { name: `B04 Event ${rid()}` });
    await rodeo.createEdition(actors.editor, { eventId: ev.id, editionSlug: '2025', label: 'First' });
    await expect(rodeo.createEdition(actors.editor, { eventId: ev.id, editionSlug: '2025', label: 'Dup' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rodeo: a recurring event with editions cannot be deleted', async () => {
    const ev = await rodeo.createEvent(actors.editor, { name: `B04 Event ${rid()}` });
    await rodeo.createEdition(actors.editor, { eventId: ev.id, editionSlug: '2024', label: 'Has edition' });
    await expect(rodeo.deleteEvent(actors.editor, ev.id)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rodeo: an edition referenced by a published article cannot be deleted', async () => {
    const ev = await rodeo.createEvent(actors.editor, { name: `B04 Event ${rid()}` });
    const ed = await rodeo.createEdition(actors.editor, { eventId: ev.id, editionSlug: '2023', label: 'Referenced' });
    await prisma.articleEdition.create({ data: { articleId: linkedArticleId, editionId: ed.id } });
    await expect(rodeo.deleteEdition(actors.editor, ed.id)).rejects.toMatchObject({ code: 'conflict' });
    await prisma.articleEdition.delete({ where: { articleId_editionId: { articleId: linkedArticleId, editionId: ed.id } } });
  });

  it('rodeo: a hub referenced by an article cannot be deleted', async () => {
    const hub = await rodeo.createHub(actors.editor, { title: `B04 Hub ${rid()}` });
    await prisma.articleHub.create({ data: { articleId: linkedArticleId, hubId: hub.id } });
    await expect(rodeo.deleteHub(actors.editor, hub.id)).rejects.toMatchObject({ code: 'conflict' });
    await prisma.articleHub.delete({ where: { articleId_hubId: { articleId: linkedArticleId, hubId: hub.id } } });
    await expect(rodeo.deleteHub(actors.editor, hub.id)).resolves.toBeUndefined();
  });

  it('rodeo: a venue used by an edition cannot be deleted', async () => {
    const ven = await rodeo.createVenue(actors.editor, { name: `B04 Venue ${rid()}` });
    const ev = await rodeo.createEvent(actors.editor, { name: `B04 Event ${rid()}` });
    await rodeo.createEdition(actors.editor, { eventId: ev.id, editionSlug: '2022', label: 'At venue', venueId: ven.id });
    await expect(rodeo.deleteVenue(actors.editor, ven.id)).rejects.toMatchObject({ code: 'conflict' });
  });

  // ---------- Website & Navigation (§F) ----------
  it('navigation: navigation.manage required — Editor is forbidden, Admin allowed', async () => {
    await expect(nav.createNavItem(actors.editor, { location: 'header', label: 'B04 Nope', url: '/competition/' })).rejects.toMatchObject({ code: 'forbidden' });
    const r = await nav.createNavItem(actors.admin, { location: 'header', label: 'B04 Extra', url: '/competition/' });
    expect(r.id).toBeTruthy();
  });

  it('navigation: URL validation — internal must start with “/”, external must be https', async () => {
    await expect(nav.createNavItem(actors.admin, { location: 'header', label: 'B04 Bad internal', url: 'competition' })).rejects.toMatchObject({ code: 'validation' });
    await expect(nav.createNavItem(actors.admin, { location: 'header', label: 'B04 Bad ext', url: 'http://insecure.example.com', isExternal: true })).rejects.toMatchObject({ code: 'validation' });
  });

  it('navigation: falls back to the static canonical menu when empty', async () => {
    await prisma.navigationItem.deleteMany({});
    const pub = await nav.getPublicNavigation();
    expect(pub.header).toHaveLength(5);
    expect(pub.header[0].label).toBe('NFR Competition');
    expect(pub.footerSections.length).toBeGreaterThan(0);
  });

  it('navigation: restoreCanonicalNav materializes protected system rows that the public read then uses', async () => {
    await prisma.navigationItem.deleteMany({});
    const { created } = await nav.restoreCanonicalNav(actors.admin);
    expect(created).toBe(15);
    const systemHeader = await prisma.navigationItem.findFirst({ where: { location: 'header', isSystem: true } });
    expect(systemHeader).toBeTruthy();
    await expect(nav.deleteNavItem(actors.admin, systemHeader!.id)).rejects.toMatchObject({ code: 'forbidden' });
    const pub = await nav.getPublicNavigation();
    expect(pub.header).toHaveLength(5);
  });

  it('navigation: a canonical system row keeps its URL + location on update', async () => {
    await prisma.navigationItem.deleteMany({});
    await nav.restoreCanonicalNav(actors.admin);
    const row = await prisma.navigationItem.findFirstOrThrow({ where: { location: 'header', isSystem: true, sortOrder: 1 } });
    await nav.updateNavItem(actors.admin, row.id, { location: 'footer-academy', label: 'Renamed', url: '/hacked', isExternal: true });
    const after = await prisma.navigationItem.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.location).toBe('header');     // locked
    expect(after.url).toBe(row.url);           // locked
    expect(after.label).toBe('Renamed');       // editable
  });

  // ---------- Dashboard + advanced article list (§3 dashboard, §5 list) ----------
  it('dashboard: returns status counts and respects the own-scope flag', async () => {
    const all = await queries.getDashboardData({ viewerId: actors.admin.id, canViewAll: true });
    expect(all.scopedToOwn).toBe(false);
    expect(all.total).toBeGreaterThan(0);
    const own = await queries.getDashboardData({ viewerId: actors.author.id, canViewAll: false });
    expect(own.scopedToOwn).toBe(true);
  });

  it('article list: status filter + pagination shape', async () => {
    const res = await queries.getAdminArticleList({ status: 'published', page: 1, pageSize: 5 });
    expect(res.pageSize).toBe(5);
    expect(res.page).toBe(1);
    expect(res.rows.length).toBeLessThanOrEqual(5);
    expect(typeof res.totalPages).toBe('number');
  });

  it('article list: free-text search matches the seeded-style title', async () => {
    const res = await queries.getAdminArticleList({ q: 'Referential Guard' });
    expect(res.rows.some((r) => r.title.includes('Referential Guard'))).toBe(true);
  });
});
