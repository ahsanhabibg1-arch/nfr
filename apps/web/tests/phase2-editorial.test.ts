import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type * as Svc from '../lib/cms/articleService';
import type * as Repo from '../lib/content';
import type * as Queries from '../lib/cms/adminQueries';
import { validateArticle } from '../utils/seoValidator';

/**
 * Phase 2 / Workstream 2 — editorial data + publishing defects (D-2, D-3, D-4, D-6, D-7).
 * Relationship persistence and edition-parent validation (ADM-06), revision restore (ADM-04),
 * published slug redirects (ADM-14 / WEB-11), publish gate on live edits (ADM-07/09/18),
 * fail-closed rights, and non-blocking SEO warnings (ADM-08).
 * Isolated test DB only; rows are prefixed `p2ed` and cleaned up.
 */

// ---- Pure (no DB) ----
describe('image-rights validation fails closed (unit)', () => {
  const base = {
    title: 'A headline', excerpt: 'An excerpt', slug: 'a-slug', imageAltText: 'A descriptive alt text',
    structuredBody: [{ type: 'paragraph', text: 'one' }, { type: 'paragraph', text: 'two' }] as never,
  };
  it('only the four resolved statuses pass; Unresolved, empty and unknown values block', () => {
    for (const ok of ['Staff Photo', 'Editorial Pool', 'PRCA Archive', 'Licensed Creative']) {
      expect(validateArticle({ ...base, imageRightsStatus: ok as never }).canPublish, ok).toBe(true);
    }
    for (const bad of ['Unresolved', '', 'garbage', 'staff photo']) {
      const r = validateArticle({ ...base, imageRightsStatus: bad as never });
      expect(r.canPublish, bad || '(empty)').toBe(false);
      expect(r.compliance.some((c) => c.field === 'imageRightsStatus')).toBe(true);
    }
  });
  it('routine SEO length findings are warnings, not blockers', () => {
    const r = validateArticle({ ...base, imageRightsStatus: 'Staff Photo', seo: { title: 'Short', description: 'Short' } });
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.canPublish).toBe(true);
  });
});

// ---- DB integration ----
let prisma: PrismaClient;
let svc: typeof Svc;
let repo: typeof Repo;
let queries: typeof Queries;
let available = false;
if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    svc = await import('../lib/cms/articleService');
    repo = await import('../lib/content');
    queries = await import('../lib/cms/adminQueries');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
    // Needs the seeded rodeo graph: two events that each have an edition.
    available = (await prisma.rodeoEventEdition.groupBy({ by: ['eventId'] })).length >= 2 && (await prisma.category.count()) > 0;
  } catch {
    available = false;
  }
}
const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 9);

suite('Phase 2 editorial integrity (isolated test DB)', () => {
  let admin: Svc.ActorContext;
  let author: Svc.ActorContext;
  let eventA: { id: string; editionId: string };
  let eventB: { id: string; editionId: string };
  let hubId: string;
  let disciplineId: string;

  async function makeUser(roleKey: string): Promise<Svc.ActorContext> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const user = await prisma.user.create({ data: { email: `p2ed-${roleKey}-${rid()}@example.com`, name: `P2 ${roleKey}`, status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return { id: user.id, roles: [roleKey] as Svc.ActorContext['roles'] };
  }

  const input = (over: Partial<Svc.ArticleInput> = {}): Svc.ArticleInput => ({
    slug: `p2ed-${rid()}`,
    title: 'Phase Two Editorial Integrity Test Headline',
    excerpt: 'A valid editorial excerpt that is long enough to satisfy the publication gate checks.',
    blocks: [
      { type: 'paragraph', text: 'Opening paragraph with a reasonable number of words for the gate.' },
      { type: 'heading', level: 2, text: 'A Section Heading' },
    ],
    categoryName: 'NFR Competition',
    authorName: 'P2 Tester',
    imageRightsStatus: 'Staff Photo',
    imageAltText: 'A descriptive alt text for the featured test photograph.',
    ...over,
  });

  async function publish(id: string): Promise<number> {
    let v = (await prisma.article.findUniqueOrThrow({ where: { id } })).version;
    for (const target of ['IN_REVIEW', 'APPROVED', 'PUBLISHED'] as const) v = (await svc.transitionWorkflow(admin, id, target, v)).version;
    return v;
  }

  beforeAll(async () => {
    admin = await makeUser('super_admin');
    author = await makeUser('author');
    const eds = await prisma.rodeoEventEdition.findMany({ select: { id: true, eventId: true }, orderBy: { eventId: 'asc' } });
    const byEvent = new Map<string, string>();
    for (const e of eds) if (!byEvent.has(e.eventId)) byEvent.set(e.eventId, e.id);
    const [[a, ae], [b, be]] = [...byEvent.entries()];
    eventA = { id: a, editionId: ae };
    eventB = { id: b, editionId: be };
    hubId = (await prisma.rodeoHub.findFirstOrThrow()).id;
    disciplineId = (await prisma.discipline.findFirstOrThrow()).id;
  });

  afterAll(async () => {
    if (!available) return;
    await prisma.articleRedirect.deleteMany({ where: { sourcePath: { startsWith: '/articles/p2ed-' } } });
    await prisma.article.deleteMany({ where: { slug: { startsWith: 'p2ed-' } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'p2ed-' } } });
  });

  // ---- A. Relationships ----
  it('persists discipline / hub / event / edition links and reloads them into the editor payload', async () => {
    const r = await svc.saveArticle(admin, input({ disciplineIds: [disciplineId], hubIds: [hubId], eventIds: [eventA.id], editionIds: [eventA.editionId] }));
    const [d, h, e, ed] = await Promise.all([
      prisma.articleDiscipline.findMany({ where: { articleId: r.id } }),
      prisma.articleHub.findMany({ where: { articleId: r.id } }),
      prisma.articleEvent.findMany({ where: { articleId: r.id } }),
      prisma.articleEdition.findMany({ where: { articleId: r.id } }),
    ]);
    expect([d.length, h.length, e.length, ed.length]).toEqual([1, 1, 1, 1]);
    const payload = await queries.getEditableArticle(r.id);
    expect(payload!.article.associatedHubIds).toEqual([hubId]);
    expect(payload!.article.associatedEventIds).toEqual([eventA.id]);
    expect(payload!.article.associatedEditionIds).toEqual([eventA.editionId]);
    expect(payload!.article.associatedDisciplineIds).toEqual([disciplineId]);

    // Many-to-many: a second event can be added; removing links clears them.
    await svc.saveArticle(admin, input({ id: r.id, slug: r.slug, eventIds: [eventA.id, eventB.id], editionIds: [eventA.editionId, eventB.editionId] }));
    expect(await prisma.articleEdition.count({ where: { articleId: r.id } })).toBe(2);
    await svc.saveArticle(admin, input({ id: r.id, slug: r.slug }));
    expect(await prisma.articleEvent.count({ where: { articleId: r.id } })).toBe(0);
  });

  it('rejects an edition whose parent event is not linked (ADM-06) and persists nothing', async () => {
    await expect(svc.saveArticle(admin, input({ editionIds: [eventA.editionId] }))).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.saveArticle(admin, input({ eventIds: [eventB.id], editionIds: [eventA.editionId] }))).rejects.toMatchObject({ code: 'validation' });
    const r = await svc.saveArticle(admin, input());
    await expect(svc.saveArticle(admin, input({ id: r.id, slug: r.slug, title: 'Changed', editionIds: [eventA.editionId] }))).rejects.toMatchObject({ code: 'validation' });
    expect((await prisma.article.findUniqueOrThrow({ where: { id: r.id } })).title).not.toBe('Changed');
  });

  it('rejects unknown or deleted relationship ids instead of silently dropping them', async () => {
    for (const over of [{ hubIds: ['no-such-hub'] }, { eventIds: ['no-such-event'] }, { disciplineIds: ['no-such-discipline'] }]) {
      await expect(svc.saveArticle(admin, input(over))).rejects.toMatchObject({ code: 'validation' });
    }
  });

  it('an evergreen article publishes without any edition (ADM-05)', async () => {
    const r = await svc.saveArticle(admin, input({ articleType: 'Rules & Format' }));
    await publish(r.id);
    expect((await prisma.article.findUniqueOrThrow({ where: { id: r.id } })).workflowStatus).toBe('PUBLISHED');
  });

  // ---- B. Revision restore ----
  it('restoring a revision restores content + relationships, appends a new revision, keeps history', async () => {
    const v1 = await svc.saveArticle(admin, input({ title: 'Original Headline For Restore', tags: ['alpha'], hubIds: [hubId] }));
    const rev1 = await prisma.articleRevision.findFirstOrThrow({ where: { articleId: v1.id }, orderBy: { revisionNo: 'desc' } });
    await svc.saveArticle(admin, input({
      id: v1.id, slug: v1.slug, title: 'Edited Headline', tags: ['beta'], hubIds: [],
      blocks: [{ type: 'paragraph', text: 'Replaced body.' }, { type: 'paragraph', text: 'Second.' }],
    }));
    const before = await prisma.articleRevision.findMany({ where: { articleId: v1.id }, orderBy: { revisionNo: 'asc' } });

    await svc.restoreRevision(admin, v1.id, rev1.id);

    const a = await prisma.article.findUniqueOrThrow({ where: { id: v1.id }, include: { blocks: { orderBy: { sortOrder: 'asc' } }, tags: { include: { tag: true } }, hubs: true } });
    expect(a.title).toBe('Original Headline For Restore');
    expect(a.blocks.map((b) => (b.data as { text?: string }).text)[0]).toMatch(/^Opening paragraph/);
    expect(a.tags.map((t) => t.tag.name)).toEqual(['alpha']);
    expect(a.hubs.map((h) => h.hubId)).toEqual([hubId]);

    const after = await prisma.articleRevision.findMany({ where: { articleId: v1.id }, orderBy: { revisionNo: 'asc' } });
    expect(after.length).toBe(before.length + 1);
    expect(after.at(-1)!.summary).toBe(`Restored revision #${rev1.revisionNo}`);
    // Earlier revisions are untouched.
    expect(after.slice(0, before.length).map((r) => [r.id, r.summary])).toEqual(before.map((r) => [r.id, r.summary]));
    expect(await prisma.auditLog.count({ where: { entityId: v1.id, action: 'article.revision.restore' } })).toBe(1);
  });

  it('restores a pre-Phase-2 { title, excerpt, slug } snapshot over the current state only', async () => {
    const r = await svc.saveArticle(admin, input({ title: 'Current Title', tags: ['keep-me'] }));
    const legacy = await prisma.articleRevision.create({
      data: { articleId: r.id, revisionNo: 99, actorName: 'legacy', actorRole: 'editor', status: 'DRAFT', summary: 'legacy', snapshot: { title: 'Legacy Title', excerpt: 'Legacy excerpt text.', slug: r.slug } },
    });
    await svc.restoreRevision(admin, r.id, legacy.id);
    const a = await prisma.article.findUniqueOrThrow({ where: { id: r.id }, include: { tags: { include: { tag: true } } } });
    expect(a.title).toBe('Legacy Title');
    expect(a.excerpt).toBe('Legacy excerpt text.');
    expect(a.tags.map((t) => t.tag.name)).toEqual(['keep-me']);
  });

  it('refuses to "restore" a workflow-only revision', async () => {
    const r = await svc.saveArticle(admin, input());
    await svc.transitionWorkflow(admin, r.id, 'IN_REVIEW');
    const wf = await prisma.articleRevision.findFirstOrThrow({ where: { articleId: r.id, summary: 'Workflow → IN_REVIEW' } });
    await expect(svc.restoreRevision(admin, r.id, wf.id)).rejects.toMatchObject({ code: 'validation' });
  });

  it('restoring onto a published article keeps it published but cannot bypass the publish gate', async () => {
    const r = await svc.saveArticle(admin, input({ imageRightsStatus: 'Unresolved' }));
    const unresolvedRev = await prisma.articleRevision.findFirstOrThrow({ where: { articleId: r.id }, orderBy: { revisionNo: 'desc' } });
    await svc.saveArticle(admin, input({ id: r.id, slug: r.slug, imageRightsStatus: 'Staff Photo' }));
    await publish(r.id);
    await expect(svc.restoreRevision(admin, r.id, unresolvedRev.id)).rejects.toMatchObject({ code: 'validation' });
    const a = await prisma.article.findUniqueOrThrow({ where: { id: r.id } });
    expect([a.workflowStatus, a.imageRightsStatus]).toEqual(['PUBLISHED', 'STAFF_PHOTO']);
  });

  // ---- C. Published slug change → redirect ----
  it('a published slug change creates a redirect that resolves to the live article', async () => {
    const r = await svc.saveArticle(admin, input());
    await publish(r.id);
    const newSlug = `p2ed-renamed-${rid()}`;
    const res = await svc.saveArticle(admin, input({ id: r.id, slug: newSlug }));
    expect(res).toMatchObject({ previousSlug: r.slug, redirectCreated: true });
    expect(await repo.resolveArticleRedirect(r.slug)).toEqual({ destination: `/articles/${newSlug}/`, permanent: true });
    expect(await repo.getPublishedArticleBySlug(newSlug)).toBeTruthy();
    expect(await prisma.auditLog.count({ where: { entityId: r.id, action: 'redirect.create' } })).toBe(1);
  });

  it('repeated renames collapse chains, and renaming back never creates a loop', async () => {
    const r = await svc.saveArticle(admin, input());
    await publish(r.id);
    const [s0, s1, s2] = [r.slug, `p2ed-b-${rid()}`, `p2ed-c-${rid()}`];
    await svc.saveArticle(admin, input({ id: r.id, slug: s1 }));
    await svc.saveArticle(admin, input({ id: r.id, slug: s2 }));
    // s0 points straight at s2 (no chain through s1).
    expect((await repo.resolveArticleRedirect(s0))?.destination).toBe(`/articles/${s2}/`);
    expect((await repo.resolveArticleRedirect(s1))?.destination).toBe(`/articles/${s2}/`);

    // Back to the original slug: the article owns s0 again; s0 must not redirect anywhere.
    await svc.saveArticle(admin, input({ id: r.id, slug: s0 }));
    expect(await repo.resolveArticleRedirect(s0)).toBeNull();
    expect((await repo.resolveArticleRedirect(s2))?.destination).toBe(`/articles/${s0}/`);
    const active = await prisma.articleRedirect.findMany({ where: { status: 'ACTIVE', sourcePath: { in: [s0, s1, s2].map((s) => `/articles/${s}/`) } } });
    for (const red of active) expect(red.sourcePath).not.toBe(red.targetPath);
  });

  it('rejects a slug already used by another article (canonical stays unique)', async () => {
    const a = await svc.saveArticle(admin, input());
    const b = await svc.saveArticle(admin, input());
    await expect(svc.saveArticle(admin, input({ id: b.id, slug: a.slug }))).rejects.toMatchObject({ code: 'conflict' });
  });

  it('slug changes on unpublished articles create no redirect; redirects to non-live targets do not resolve', async () => {
    const r = await svc.saveArticle(admin, input());
    const res = await svc.saveArticle(admin, input({ id: r.id, slug: `p2ed-draft-${rid()}` }));
    expect(res.redirectCreated).toBe(false);
    expect(await prisma.articleRedirect.count({ where: { sourcePath: `/articles/${r.slug}/` } })).toBe(0);

    await prisma.articleRedirect.create({ data: { sourcePath: `/articles/p2ed-dangling-${rid()}/`, targetPath: `/articles/${res.slug}/` } });
    const dangling = await prisma.articleRedirect.findFirstOrThrow({ where: { targetPath: `/articles/${res.slug}/` } });
    expect(await repo.resolveArticleRedirect(dangling.sourcePath.split('/')[2])).toBeNull(); // target is a draft
    const external = await prisma.articleRedirect.create({ data: { sourcePath: `/articles/p2ed-ext-${rid()}/`, targetPath: 'https://evil.example/' } });
    expect(await repo.resolveArticleRedirect(external.sourcePath.split('/')[2])).toBeNull(); // never an off-site target
  });

  // ---- D. Publish gate on live edits / rights ----
  it('editing a published article cannot strip rights or required fields; valid edits still save', async () => {
    const r = await svc.saveArticle(admin, input());
    const v = await publish(r.id);
    await expect(svc.saveArticle(admin, input({ id: r.id, slug: r.slug, expectedVersion: v, imageRightsStatus: 'Unresolved' }))).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.saveArticle(admin, input({ id: r.id, slug: r.slug, expectedVersion: v, imageAltText: '' }))).rejects.toMatchObject({ code: 'validation' });
    await expect(svc.saveArticle(admin, input({ id: r.id, slug: r.slug, expectedVersion: v, blocks: [] }))).rejects.toMatchObject({ code: 'validation' });
    expect((await prisma.article.findUniqueOrThrow({ where: { id: r.id } })).version).toBe(v); // nothing written

    const ok = await svc.saveArticle(admin, input({ id: r.id, slug: r.slug, expectedVersion: v, title: 'A Corrected Headline For The Live Article' }));
    expect(ok.version).toBe(v + 1);
    expect((await prisma.article.findUniqueOrThrow({ where: { id: r.id } })).workflowStatus).toBe('PUBLISHED');
  });

  it('unknown rights values are rejected at the server boundary; omitted rights default to Unresolved', async () => {
    await expect(svc.saveArticle(admin, input({ imageRightsStatus: 'garbage' as never }))).rejects.toThrow();
    const { imageRightsStatus: _omit, ...noRights } = input();
    const r = await svc.saveArticle(admin, noRights as Svc.ArticleInput);
    expect((await prisma.article.findUniqueOrThrow({ where: { id: r.id } })).imageRightsStatus).toBe('UNRESOLVED');
    await svc.transitionWorkflow(admin, r.id, 'IN_REVIEW');
    await svc.transitionWorkflow(admin, r.id, 'APPROVED');
    await expect(svc.transitionWorkflow(admin, r.id, 'PUBLISHED')).rejects.toMatchObject({ code: 'validation' });
  });

  it('a managed image with unconfirmed rights blocks editing a live article to use it (ADM-18)', async () => {
    const r = await svc.saveArticle(admin, input());
    const v = await publish(r.id);
    const asset = await prisma.mediaAsset.create({
      data: { storageKey: `p2ed/${rid()}.webp`, url: `/api/media/p2ed-${rid()}.webp`, filename: 'x.webp', storageProvider: 'local', rightsConfirmed: false },
    });
    try {
      await expect(svc.saveArticle(admin, input({ id: r.id, slug: r.slug, expectedVersion: v, heroImage: asset.url }))).rejects.toMatchObject({ code: 'validation' });
    } finally {
      await prisma.mediaAsset.delete({ where: { id: asset.id } });
    }
  });

  it('a routine SEO warning does not block an authorized publication (ADM-08)', async () => {
    const r = await svc.saveArticle(admin, input({ seoTitle: 'Short' }));
    await publish(r.id);
    expect((await prisma.article.findUniqueOrThrow({ where: { id: r.id } })).workflowStatus).toBe('PUBLISHED');
  });

  it('authorized unpublish still works, and authors still cannot edit live articles', async () => {
    const r = await svc.saveArticle(admin, input());
    const v = await publish(r.id);
    await expect(svc.saveArticle(author, input({ id: r.id, slug: r.slug }))).rejects.toMatchObject({ code: 'forbidden' });
    const down = await svc.transitionWorkflow(admin, r.id, 'DRAFT', v);
    expect(down.becamePrivate).toBe(true);
  });
});
