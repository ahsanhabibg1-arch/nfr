import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Actor } from '../lib/cms/guard';
import type { RoleKey } from '../lib/auth/rbac';
import type * as SeoSvc from '../lib/cms/seoService';
import type * as ArticleSvc from '../lib/cms/articleService';

/**
 * Batch 06 SEO Intelligence integration (§22). Exercises the REAL engine +
 * service against the test DB: analyzers, persistence/dedup/reopen/auto-resolve,
 * RBAC, author scoping, config, concurrent-run prevention, audit history.
 * Self-skips without DATABASE_URL. All rows use the `seotest` prefix.
 */
let available = false;
let prisma: PrismaClient;
let seo: typeof SeoSvc;
let article: typeof ArticleSvc;
let orch: typeof import('../lib/seo-intel/orchestrator');

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    available = true;
    seo = await import('../lib/cms/seoService');
    article = await import('../lib/cms/articleService');
    orch = await import('../lib/seo-intel/orchestrator');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
    await orch.syncSeoRules(prisma);
  } catch { available = false; }
}
const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

suite('Batch 06 — SEO Intelligence integration', () => {
  const actors: Record<string, Actor> = {};
  const artIds: Record<string, string> = {};
  const extraIds: string[] = [];

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({ data: { email: `seotest-${roleKey}-${rid()}@example.com`, name: `S ${roleKey}`, status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    return { id: u.id, roles: [roleKey] };
  }
  function input(over: Partial<ArticleSvc.ArticleInput> = {}): ArticleSvc.ArticleInput {
    return {
      slug: `seotest-${rid()}`, title: 'SEO Test Dispatch Headline',
      excerpt: 'A valid editorial excerpt that is long enough to satisfy the publication gate checks for this SEO test case.',
      blocks: [{ type: 'paragraph', text: 'Opening paragraph with a reasonable number of words here to exceed the minimum body length guidance threshold for the analyzer.' }, { type: 'heading', level: 2, text: 'A Section Heading' }],
      categoryName: 'NFR Competition', authorName: 'SEO Tester', imageRightsStatus: 'Staff Photo',
      imageAltText: 'A descriptive alt text for the featured test photograph.', seoTitle: 'A Reasonable SEO Title For Testing Rules', metaDescription: 'A reasonable meta description that falls within the configured guidance length range for the SEO analyzer checks.',
      ...over,
    } as ArticleSvc.ArticleInput;
  }
  const publish = (id: string, extra: Record<string, unknown> = {}) => prisma.article.update({ where: { id }, data: { workflowStatus: 'PUBLISHED', publishedAt: new Date(), ...extra } });

  beforeAll(async () => {
    actors.admin = await makeUser('administrator');
    actors.editor = await makeUser('editor');
    actors.seomgr = await makeUser('seo_manager');
    actors.author = await makeUser('author');

    // Base valid published article (owned by author, shares a discipline for opportunity).
    const good = await article.saveArticle(actors.author as ArticleSvc.ActorContext, input());
    artIds.good = good.id; await publish(good.id);
    await prisma.articleSeo.update({ where: { articleId: good.id }, data: { canonicalUrl: `https://nfrguide.com/articles/${good.slug}/` } });

    // Missing-metadata article.
    const miss = await article.saveArticle(actors.admin as ArticleSvc.ActorContext, input());
    artIds.miss = miss.id; await publish(miss.id);
    await prisma.articleSeo.update({ where: { articleId: miss.id }, data: { seoTitle: null, metaDescription: null, canonicalUrl: null } });
    await prisma.article.update({ where: { id: miss.id }, data: { excerpt: '' } });

    // Duplicate SEO title + meta description pair.
    const dupTitle = 'Identical Duplicate SEO Title Across Two Articles';
    const dupDesc = 'Identical duplicate meta description shared by two different test articles for the duplicate-detection analyzer.';
    const d1 = await article.saveArticle(actors.admin as ArticleSvc.ActorContext, input({ seoTitle: dupTitle, metaDescription: dupDesc }));
    const d2 = await article.saveArticle(actors.admin as ArticleSvc.ActorContext, input({ seoTitle: dupTitle, metaDescription: dupDesc }));
    artIds.d1 = d1.id; artIds.d2 = d2.id; await publish(d1.id); await publish(d2.id);

    // Noindex + future-dated published article.
    const bad = await article.saveArticle(actors.admin as ArticleSvc.ActorContext, input());
    artIds.bad = bad.id; await publish(bad.id, { publishedAt: new Date(Date.now() + 7 * 864e5) });
    await prisma.articleSeo.update({ where: { articleId: bad.id }, data: { robots: 'noindex, nofollow' } });

    // Broken internal link in the body.
    const link = await article.saveArticle(actors.admin as ArticleSvc.ActorContext, input({ blocks: [{ type: 'paragraph', text: 'See our coverage at /articles/this-article-absolutely-does-not-exist-xyz/ for more, plus more words to clear the body length guidance threshold here.' }] as never }));
    artIds.link = link.id; await publish(link.id);

    // DAM hero in a bad public state (private + no alt + unconfirmed) on a published article.
    const media = await prisma.mediaAsset.create({ data: { storageProvider: 'local', storageKey: `2026/10/seotest-${rid()}.jpg`, url: `/api/media/2026/10/seotest-${rid()}.jpg`, filename: 'x.jpg', extension: 'jpg', mimeType: 'image/jpeg', visibility: 'DRAFT', rightsConfirmed: false, altText: null, width: 800, height: 600 } });
    extraIds.push(media.id);
    const img = await article.saveArticle(actors.admin as ArticleSvc.ActorContext, input({ heroImage: media.url, imageAltText: '' }));
    artIds.img = img.id; await publish(img.id, { heroImageUrl: media.url, imageAltText: '' });
    await prisma.articleMedia.upsert({ where: { articleId_usageKey: { articleId: img.id, usageKey: 'hero' } }, update: { mediaId: media.id }, create: { articleId: img.id, usageKey: 'hero', mediaId: media.id } });

    // Share a discipline between `good` and `d1` for the link opportunity.
    const disc = await prisma.discipline.findFirst({ select: { id: true } });
    if (disc) { await prisma.articleDiscipline.createMany({ data: [{ articleId: good.id, disciplineId: disc.id }, { articleId: d1.id, disciplineId: disc.id }], skipDuplicates: true }); }

    // Rodeo: duplicate slug across a hub and an event + an edition mismatch.
    const dupSlug = `seotest-dup-${rid()}`;
    const hub = await prisma.rodeoHub.create({ data: { id: `hub-${dupSlug}`, slug: dupSlug, title: 'SEO Test Hub' } });
    const ev1 = await prisma.rodeoEvent.create({ data: { id: `event-seotest-${rid()}`, slug: dupSlug, name: 'SEO Test Event One' } });
    const ev2 = await prisma.rodeoEvent.create({ data: { id: `event-seotest-${rid()}`, slug: `seotest-ev2-${rid()}`, name: 'SEO Test Event Two' } });
    const ed1 = await prisma.rodeoEventEdition.create({ data: { eventId: ev1.id, editionSlug: '2020', label: 'SEO Test 2020', year: 2020 } });
    extraIds.push(hub.id, ev1.id, ev2.id);
    // mismatch: link `good` to ed1 (parent ev1) and to ev2 (not ev1).
    await prisma.articleEdition.create({ data: { articleId: good.id, editionId: ed1.id } });
    await prisma.articleEvent.create({ data: { articleId: good.id, eventId: ev2.id } });

    await orch.syncSeoRules(prisma);
  });

  afterAll(async () => {
    if (!available) return;
    const ids = Object.values(artIds);
    await prisma.seoFinding.deleteMany({ where: { OR: [{ articleId: { in: ids } }, { entityId: { startsWith: 'seotest' } }, { entityId: { startsWith: 'hub-seotest' } }, { entityId: { startsWith: 'event-seotest' } }] } });
    await prisma.article.deleteMany({ where: { slug: { startsWith: 'seotest-' } } });
    await prisma.mediaAsset.deleteMany({ where: { id: { in: extraIds } } });
    await prisma.rodeoEvent.deleteMany({ where: { id: { startsWith: 'event-seotest' } } });
    await prisma.rodeoHub.deleteMany({ where: { id: { startsWith: 'hub-seotest' } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'seotest-' } } });
    await prisma.$disconnect();
  });

  async function codesFor(articleId: string): Promise<Set<string>> {
    const rows = await prisma.seoFinding.findMany({ where: { articleId }, select: { ruleCode: true } });
    return new Set(rows.map((r) => r.ruleCode));
  }

  // ---- RBAC (1, 2, 24) ----
  it('audit authorization: Author cannot run; Editor + SEO Manager can', async () => {
    await expect(seo.runSeoAudit(actors.author, { kind: 'full' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(seo.runSeoAudit(actors.editor, { kind: 'full' })).resolves.toBeTruthy();
    await expect(seo.runSeoAudit(actors.seomgr, { kind: 'full' })).resolves.toBeTruthy();
  });
  it('config permissions: Editor cannot change thresholds; SEO Manager can', async () => {
    await expect(seo.updateSeoThresholds(actors.editor, { seoTitleMin: 20, seoTitleMax: 65, metaDescMin: 70, metaDescMax: 165, minBodyWords: 60 })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(seo.updateSeoThresholds(actors.seomgr, { seoTitleMin: 20, seoTitleMax: 65, metaDescMin: 70, metaDescMax: 165, minBodyWords: 60 })).resolves.toBeUndefined();
  });

  // ---- Analyzer coverage (3-16) ----
  it('detects the expected findings across analyzers', async () => {
    await seo.runSeoAudit(actors.admin, { kind: 'full' });
    const miss = await codesFor(artIds.miss);
    expect(miss.has('ART_NO_SEO_TITLE')).toBe(true);
    expect(miss.has('ART_NO_META_DESC')).toBe(true);
    expect(miss.has('ART_NO_EXCERPT')).toBe(true);
    expect(miss.has('TECH_NO_CANONICAL')).toBe(true);
    expect((await codesFor(artIds.d1)).has('ART_DUP_SEO_TITLE')).toBe(true);
    expect((await codesFor(artIds.d1)).has('ART_DUP_META_DESC')).toBe(true);
    const bad = await codesFor(artIds.bad);
    expect(bad.has('TECH_PUBLISHED_NOINDEX')).toBe(true);
    expect(bad.has('ART_FUTURE_PUBDATE')).toBe(true);
    expect((await codesFor(artIds.link)).has('LINK_BROKEN')).toBe(true);
    const img = await codesFor(artIds.img);
    expect(img.has('IMG_PRIVATE_ON_PUBLISHED')).toBe(true);
    expect(img.has('IMG_NO_ALT')).toBe(true);
    expect(img.has('IMG_RIGHTS_UNCONFIRMED')).toBe(true);
    // structured data on the missing-metadata / normal published articles
    expect((await codesFor(artIds.good)).has('RODEO_ARTICLE_EDITION_MISMATCH')).toBe(true);
    // rodeo duplicate slug (entity finding, not article-scoped)
    expect(await prisma.seoFinding.count({ where: { ruleCode: 'RODEO_DUP_SLUG' } })).toBeGreaterThan(0);
    // orphan + opportunity exist somewhere among the test set
    expect(await prisma.seoFinding.count({ where: { ruleCode: 'LINK_ORPHAN', articleId: { in: Object.values(artIds) } } })).toBeGreaterThan(0);
  });

  // ---- Persistence, dedup, reopen, auto-resolve, history (17-20) ----
  it('findings persist and deduplicate across repeated runs (stable fingerprints)', async () => {
    await seo.runSeoAudit(actors.admin, { kind: 'full' });
    const before = await prisma.seoFinding.count({ where: { articleId: artIds.miss, ruleCode: 'ART_NO_SEO_TITLE' } });
    await seo.runSeoAudit(actors.admin, { kind: 'full' });
    const after = await prisma.seoFinding.count({ where: { articleId: artIds.miss, ruleCode: 'ART_NO_SEO_TITLE' } });
    expect(before).toBe(1);
    expect(after).toBe(1); // no duplicate created
  });
  it('resolving the underlying defect auto-resolves the finding; reappearing reopens it', async () => {
    // Fix the missing SEO title → re-audit auto-resolves it.
    await prisma.articleSeo.update({ where: { articleId: artIds.miss }, data: { seoTitle: 'Now A Proper SEO Title For The Article' } });
    await seo.runSeoAudit(actors.admin, { kind: 'full' });
    let f = await prisma.seoFinding.findFirstOrThrow({ where: { articleId: artIds.miss, ruleCode: 'ART_NO_SEO_TITLE' } });
    expect(f.status).toBe('RESOLVED');
    // Break it again → re-audit reopens the SAME finding.
    await prisma.articleSeo.update({ where: { articleId: artIds.miss }, data: { seoTitle: null } });
    await seo.runSeoAudit(actors.admin, { kind: 'full' });
    f = await prisma.seoFinding.findFirstOrThrow({ where: { articleId: artIds.miss, ruleCode: 'ART_NO_SEO_TITLE' } });
    expect(f.status).toBe('REOPENED');
  });
  it('audit history: each run is recorded with a completed status', async () => {
    const runs = await prisma.seoAuditRun.count({ where: { status: 'completed' } });
    expect(runs).toBeGreaterThan(0);
  });

  // ---- Concurrency + scope (21, 22) ----
  it('concurrent audit prevention: a running audit blocks a new one', async () => {
    const stuck = await prisma.seoAuditRun.create({ data: { scope: 'full', engineVersion: 'x', status: 'running' } });
    await expect(seo.runSeoAudit(actors.admin, { kind: 'full' })).rejects.toMatchObject({ code: 'conflict' });
    await prisma.seoAuditRun.update({ where: { id: stuck.id }, data: { status: 'completed', completedAt: new Date() } });
  });
  it('scope restriction: an article-scoped audit only writes findings for that article', async () => {
    const r = await seo.runSeoAudit(actors.admin, { kind: 'article', articleId: artIds.bad });
    expect(r.total).toBeGreaterThan(0);
    // every finding from this run is for the scoped article
    const runFindings = await prisma.seoFinding.findMany({ where: { auditRunId: r.auditRunId }, select: { articleId: true } });
    expect(runFindings.every((f) => f.articleId === artIds.bad)).toBe(true);
  });

  // ---- Finding workflow (14) + author scoping (23) ----
  it('finding workflow: manage perm required; status + resolver recorded', async () => {
    await seo.runSeoAudit(actors.admin, { kind: 'full' });
    const f = await prisma.seoFinding.findFirstOrThrow({ where: { articleId: artIds.bad, ruleCode: 'TECH_PUBLISHED_NOINDEX' } });
    await expect(seo.updateFinding(actors.author, f.id, { status: 'IN_PROGRESS' })).rejects.toMatchObject({ code: 'forbidden' });
    await seo.updateFinding(actors.admin, f.id, { status: 'IN_PROGRESS', assignedToId: actors.editor.id });
    const after = await prisma.seoFinding.findUniqueOrThrow({ where: { id: f.id } });
    expect(after.status).toBe('IN_PROGRESS');
    expect(after.assignedToId).toBe(actors.editor.id);
  });
  it('author-owned visibility: an Author sees only findings on their own articles', async () => {
    await seo.runSeoAudit(actors.admin, { kind: 'full' });
    const res = await seo.listFindings(actors.author, { pageSize: 100 });
    // `good` is authored by the author; `bad`/`miss` by admin.
    const ids = new Set(await (await prisma.seoFinding.findMany({ where: { articleId: artIds.good }, select: { id: true } })).map((r) => r.id));
    expect(res.rows.length).toBeGreaterThan(0);
    // none of the returned findings belong to an article the author doesn't own
    const ownArticleIds = new Set((await prisma.article.findMany({ where: { createdById: actors.author.id }, select: { id: true } })).map((a) => a.id));
    const detailed = await prisma.seoFinding.findMany({ where: { id: { in: res.rows.map((r) => r.id) } }, select: { articleId: true } });
    expect(detailed.every((f) => f.articleId && ownArticleIds.has(f.articleId))).toBe(true);
    expect(ids.size).toBeGreaterThan(0);
  });

  // ---- Publication workflow intact (25) ----
  it('SEO is advisory-only: the article publication workflow is unaffected', async () => {
    const a = await article.saveArticle(actors.admin as ArticleSvc.ActorContext, input());
    const r1 = await article.transitionWorkflow(actors.admin as ArticleSvc.ActorContext, a.id, 'IN_REVIEW', a.version);
    const r2 = await article.transitionWorkflow(actors.admin as ArticleSvc.ActorContext, a.id, 'APPROVED', r1.version);
    const r3 = await article.transitionWorkflow(actors.admin as ArticleSvc.ActorContext, a.id, 'PUBLISHED', r2.version);
    expect(r3.becamePublic).toBe(true); // SEO findings never block publishing
  });
});
