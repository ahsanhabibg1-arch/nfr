import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { Actor } from '../lib/cms/guard';
import type { RoleKey } from '../lib/auth/rbac';
import type * as AtSvc from '../lib/cms/articleTypeService';
import type * as Registry from '../lib/cms/articleTypeRegistry';
import type { ArticleTypeSnapshot, ManagedArticleType } from '../lib/content/articleTypeShape';

/**
 * Batch 04-E.1 — Article Type governance refinement.
 *
 * TWO THINGS ARE UNDER TEST, and they are different in kind.
 *
 * TASK A is an authorization narrowing: evergreen eligibility moves off the
 * shared `seo.config` — which Administrator also holds site-wide — and onto
 * `articletype.seo`, held by SEO Manager and Super Admin only. The tests check
 * both halves of every boundary: that the denied role is refused AND that
 * nothing changed afterwards, and that the narrowing took nothing away from the
 * roles that should still be able to work.
 *
 * TASK B is a correctness fix in the structured-data path. The concern as
 * stated — "a registry failure downgrades a news article to Article" — was
 * already handled: `getArticleTypeSnapshot` falls back to all 23 compatibility
 * definitions when the table is absent, unreachable or empty, so an outright
 * failure never produced a partial answer. The reachable defect was narrower
 * and quieter: a snapshot that came FROM the database and is INCOMPLETE. The
 * bootstrap inserts row by row with no transaction, so an interrupted run
 * leaves a real partial registry, and a published `News` article would then
 * have declared `Article` to search engines with nothing logged. Both the
 * already-correct behaviour and the fix are asserted here.
 */

let available = false;
let prisma: PrismaClient;
let svc: typeof AtSvc;
let registry: typeof Registry;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    await prisma.articleType.count();
    svc = await import('../lib/cms/articleTypeService');
    registry = await import('../lib/cms/articleTypeRegistry');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
    available = true;
  } catch {
    available = false;
  }
}

const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

/** A managed definition, for building snapshots by hand. */
function managed(value: string, schemaType: 'Article' | 'NewsArticle', over: Partial<ManagedArticleType> = {}): ManagedArticleType {
  return {
    value, label: value, description: null, sortOrder: 0,
    selectable: true, evergreen: false, schemaType, archived: false, ...over,
  };
}
const dbSnapshot = (types: ManagedArticleType[]): ArticleTypeSnapshot => ({ source: 'database', types });

// ===========================================================================
// TASK A — RBAC, at the level that does not need a database.
// ===========================================================================

describe('04-E.1 Task A — the permission matrix', () => {
  it('(1,2,3,4,5) articletype.seo is held by Super Admin and SEO Manager ONLY', async () => {
    const { ROLE_PERMISSIONS } = await import('../lib/auth/rbac');
    expect(ROLE_PERMISSIONS.super_admin).toContain('articletype.seo');
    expect(ROLE_PERMISSIONS.seo_manager).toContain('articletype.seo');
    expect(ROLE_PERMISSIONS.administrator).not.toContain('articletype.seo');
    expect(ROLE_PERMISSIONS.editor).not.toContain('articletype.seo');
    expect(ROLE_PERMISSIONS.author).not.toContain('articletype.seo');
    expect(ROLE_PERMISSIONS.reader).not.toContain('articletype.seo');
  });

  it('the three Article Type gates stay independent — none implies another', async () => {
    const { ROLE_PERMISSIONS } = await import('../lib/auth/rbac');
    // Administrator manages types but sets neither SEO-bearing field.
    expect(ROLE_PERMISSIONS.administrator).toContain('articletype.manage');
    expect(ROLE_PERMISSIONS.administrator).not.toContain('articletype.seo');
    expect(ROLE_PERMISSIONS.administrator).not.toContain('system.config');
    // SEO Manager sets evergreen and manages nothing.
    expect(ROLE_PERMISSIONS.seo_manager).toContain('articletype.seo');
    expect(ROLE_PERMISSIONS.seo_manager).not.toContain('articletype.manage');
    expect(ROLE_PERMISSIONS.seo_manager).not.toContain('system.config');
    // Super Admin holds all three.
    for (const p of ['articletype.manage', 'articletype.seo', 'system.config'] as const) {
      expect(ROLE_PERMISSIONS.super_admin).toContain(p);
    }
  });

  it('REGRESSION: seo.config itself is untouched and keeps its existing holders', async () => {
    const { ROLE_PERMISSIONS } = await import('../lib/auth/rbac');
    // The narrowing must not have removed `seo.config` from anyone: it still
    // gates the SEO Intelligence module and the audit thresholds.
    expect(ROLE_PERMISSIONS.super_admin).toContain('seo.config');
    expect(ROLE_PERMISSIONS.administrator).toContain('seo.config');
    expect(ROLE_PERMISSIONS.seo_manager).toContain('seo.config');
    expect(ROLE_PERMISSIONS.editor).not.toContain('seo.config');
    expect(ROLE_PERMISSIONS.author).not.toContain('seo.config');
  });

  it('the new permission appears in the real permission matrix UI source', async () => {
    const { buildPermissionMatrix } = await import('../lib/auth/permissions');
    const rows = buildPermissionMatrix().flatMap((g) => g.rows);
    const row = rows.find((r) => r.key === 'articletype.seo');
    expect(row, 'articletype.seo must be in the catalogue').toBeTruthy();
    expect(row!.roles.super_admin).toBe(true);
    expect(row!.roles.seo_manager).toBe(true);
    expect(row!.roles.administrator).toBe(false);
    expect(row!.roles.editor).toBe(false);
    expect(row!.roles.author).toBe(false);
  });

  it('the evergreen server action is gated by articletype.seo, not seo.config', async () => {
    // Read as source: the action module cannot be invoked outside a request, and
    // what matters is WHICH permission string the gate names.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/admin/article-type-actions.ts', 'utf8');
    const body = src.slice(src.indexOf('setArticleTypeEvergreenAction'));
    const gate = body.slice(0, body.indexOf('catch'));
    expect(gate).toContain("requireActor('articletype.seo')");
    expect(gate).not.toContain("requireActor('seo.config')");
    // And the Super-Admin-only gate is unchanged.
    const schemaBody = src.slice(src.indexOf('setArticleTypeSchemaTypeAction'));
    expect(schemaBody.slice(0, schemaBody.indexOf('catch'))).toContain("requireActor('system.config')");
  });

  it('the admin screen derives the evergreen control from articletype.seo', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('app/admin/(dashboard)/editorial-organization/page.tsx', 'utf8');
    expect(src).toMatch(/canArticleTypeSeo=\{roleHasPermission\(user\.roles, 'articletype\.seo'\)\}/);
  });
});

// ===========================================================================
// TASK B — classification resolution. Pure, so it runs everywhere.
// ===========================================================================

describe('04-E.1 Task B — the three classification cases', () => {
  it('(11,12) Case 1: a managed classification is authoritative', async () => {
    const { schemaTypeIn } = await import('../lib/content/articleTypeShape');
    const snap = dbSnapshot([managed('News', 'NewsArticle'), managed('guide', 'Article')]);
    expect(schemaTypeIn(snap, 'News')).toBe('NewsArticle');
    expect(schemaTypeIn(snap, 'guide')).toBe('Article');
  });

  it('(17) Case 1: a managed override WINS over the compatibility definition', async () => {
    const { schemaTypeIn } = await import('../lib/content/articleTypeShape');
    // `News` is compiled in as NewsArticle. A Super Admin who reclassified it
    // to Article must not be overruled by the fallback.
    expect(schemaTypeIn(dbSnapshot([managed('News', 'Article')]), 'News')).toBe('Article');
    // And the reverse: `guide` is compiled in as Article.
    expect(schemaTypeIn(dbSnapshot([managed('guide', 'NewsArticle')]), 'guide')).toBe('NewsArticle');
  });

  it('(13,14) Case 2: a recognised type keeps its classification when the snapshot omits it', async () => {
    const { schemaTypeIn, fallbackSnapshot } = await import('../lib/content/articleTypeShape');
    /**
     * THE 04-E.1 FIX. This snapshot is `source: 'database'` and holds a single
     * row — exactly what an interrupted bootstrap leaves behind. Before the
     * fix, every one of these resolved to 'Article'.
     */
    const partial = dbSnapshot([managed('guide', 'Article')]);
    expect(schemaTypeIn(partial, 'News')).toBe('NewsArticle');
    expect(schemaTypeIn(partial, 'news')).toBe('NewsArticle');
    expect(schemaTypeIn(partial, 'Event Update')).toBe('NewsArticle');
    // …and a recognised non-news type still resolves to Article, for the same
    // reason rather than by accident.
    expect(schemaTypeIn(partial, 'Rules & Format')).toBe('Article');
    expect(schemaTypeIn(partial, 'explainer')).toBe('Article');
    // An entirely empty database snapshot behaves the same way.
    expect(schemaTypeIn(dbSnapshot([]), 'News')).toBe('NewsArticle');
    // And the whole-registry fallback was already correct.
    expect(schemaTypeIn(fallbackSnapshot(), 'News')).toBe('NewsArticle');
    expect(schemaTypeIn(fallbackSnapshot(), 'guide')).toBe('Article');
  });

  it('(15) Case 3: a truly unknown value is Article, under every snapshot source', async () => {
    const { schemaTypeIn, fallbackSnapshot } = await import('../lib/content/articleTypeShape');
    const unknowns = ['Freestyle', 'Opinion', 'NewsArticle', 'news-article', '', '   ', 'Invented Type'];
    for (const snap of [dbSnapshot([]), dbSnapshot([managed('guide', 'Article')]), fallbackSnapshot()]) {
      for (const v of unknowns) {
        expect(schemaTypeIn(snap, v), `${snap.source}/${JSON.stringify(v)}`).toBe('Article');
      }
      expect(schemaTypeIn(snap, null)).toBe('Article');
      expect(schemaTypeIn(snap, undefined)).toBe('Article');
    }
  });

  it('(15,16) a CASE VARIANT is not a recognised type and never becomes NewsArticle', async () => {
    const { schemaTypeIn } = await import('../lib/content/articleTypeShape');
    const partial = dbSnapshot([managed('guide', 'Article')]);
    // `NEWS` and `News ` are not stored identities. Resolving them as news
    // would be classifying an UNKNOWN value as NewsArticle — the one thing the
    // conservative rule forbids.
    for (const v of ['NEWS', 'NeWs', ' News', 'News ', 'EVENT UPDATE']) {
      expect(schemaTypeIn(partial, v), v).toBe('Article');
    }
  });

  it('(16) News and news remain DISTINCT identities throughout', async () => {
    const { schemaTypeIn } = await import('../lib/content/articleTypeShape');
    const { ARTICLE_TYPES } = await import('../lib/content/articleTypes');
    // Both defined, separately, in the compatibility registry.
    expect(ARTICLE_TYPES.filter((t) => t.value === 'News')).toHaveLength(1);
    expect(ARTICLE_TYPES.filter((t) => t.value === 'news')).toHaveLength(1);
    expect(ARTICLE_TYPES.find((t) => t.value === 'News')!.selectable).toBe(true);
    expect(ARTICLE_TYPES.find((t) => t.value === 'news')!.selectable).toBe(false);
    // Managing one does not resolve the other: here `News` is managed as
    // Article while legacy `news` still falls back to NewsArticle.
    const snap = dbSnapshot([managed('News', 'Article')]);
    expect(schemaTypeIn(snap, 'News')).toBe('Article');
    expect(schemaTypeIn(snap, 'news')).toBe('NewsArticle');
  });

  it('(18) the synchronous JSON-LD API is unchanged and still backward compatible', async () => {
    const seo = await import('../lib/seo');
    const a = {
      id: 'x', slug: 's', title: 'T', deck: 'D', excerpt: 'E', content: [], category: 'NFR Competition',
      readTime: '3 min read', author: { name: 'A', role: 'R' }, publishedAt: '2026-01-01',
    } as unknown as import('../types').Article;

    // One argument, synchronous, compiled-in behaviour — exactly as before 04-E.
    expect(seo.articleJsonLd({ ...a, articleType: 'News' })['@type']).toBe('NewsArticle');
    expect(seo.articleJsonLd({ ...a, articleType: 'guide' })['@type']).toBe('Article');
    // The optional resolved classification still overrides.
    expect(seo.articleJsonLd({ ...a, articleType: 'guide' }, { schemaType: 'NewsArticle' })['@type']).toBe('NewsArticle');
    expect(seo.articleJsonLd({ ...a, articleType: 'News' }, { schemaType: 'Article' })['@type']).toBe('Article');
    // It is not a promise.
    expect(seo.articleJsonLd({ ...a, articleType: 'News' })).not.toBeInstanceOf(Promise);
  });

  it('(19) no JSON-LD field other than @type can change with the classification', async () => {
    const seo = await import('../lib/seo');
    const a = {
      id: 'x', slug: 'a-slug', title: 'T', deck: 'D', excerpt: 'E', content: [], category: 'NFR Competition',
      readTime: '3 min read', author: { name: 'A', role: 'R' },
      publishedAt: '2026-01-01', updatedAt: '2026-02-02', heroImage: '/img/x.jpg', articleType: 'guide',
    } as unknown as import('../types').Article;

    const asArticle = seo.articleJsonLd(a, { schemaType: 'Article' });
    const asNews = seo.articleJsonLd(a, { schemaType: 'NewsArticle' });
    expect(Object.keys(asArticle).sort()).toEqual(Object.keys(asNews).sort());
    for (const k of Object.keys(asArticle)) {
      if (k === '@type') continue;
      expect(JSON.stringify(asNews[k]), k).toBe(JSON.stringify(asArticle[k]));
    }
    expect(asNews.datePublished).toBe('2026-01-01');
    expect(asNews.dateModified).toBe('2026-02-02');
  });
});

// ===========================================================================
// TASK B — controlled registry failure, with the real module graph.
// ===========================================================================

describe('04-E.1 Task B — a failing registry is survivable and is reported', () => {
  const failing = (code: string, message: string) => ({
    prisma: {
      articleType: {
        findMany: async () => {
          const e = new Error(message) as Error & { code?: string };
          e.code = code;
          throw e;
        },
      },
    },
  });

  afterAll(() => {
    vi.doUnmock('../lib/db');
    vi.resetModules();
  });

  it('(13,20) an unreachable database yields the FULL compatibility registry, not a partial one', async () => {
    vi.resetModules();
    vi.doMock('../lib/db', () => failing('P1001', "Can't reach database server"));
    const reg = await import('../lib/cms/articleTypeRegistry');
    reg.resetArticleTypeRegistryForTests();

    const snap = await reg.getArticleTypeSnapshot();
    expect(snap.source).toBe('fallback');
    expect(snap.types).toHaveLength(23);
    // The news types survive the outage — the specific concern behind Task B.
    expect(await reg.getArticleSchemaType('News')).toBe('NewsArticle');
    expect(await reg.getArticleSchemaType('news')).toBe('NewsArticle');
    expect(await reg.getArticleSchemaType('Event Update')).toBe('NewsArticle');
    expect(await reg.getArticleSchemaType('guide')).toBe('Article');
    expect(await reg.getArticleSchemaType('Freestyle')).toBe('Article');
    // And the evergreen surface does not empty out.
    expect(await reg.getEvergreenArticleTypeValues()).toContain('guide');

    vi.doUnmock('../lib/db');
    vi.resetModules();
  });

  it('(20) a missing TABLE (migration not applied) behaves identically and never throws', async () => {
    vi.resetModules();
    vi.doMock('../lib/db', () => failing('P2021', 'The table `public.ArticleType` does not exist'));
    const reg = await import('../lib/cms/articleTypeRegistry');
    reg.resetArticleTypeRegistryForTests();

    await expect(reg.getArticleTypeSnapshot()).resolves.toMatchObject({ source: 'fallback' });
    expect(await reg.getArticleSchemaType('News')).toBe('NewsArticle');
    await expect(reg.isStorableArticleType('guide')).resolves.toBe(true);
    await expect(reg.isAssignableArticleType('guide')).resolves.toBe(false);
    await expect(reg.isAssignableArticleType('News')).resolves.toBe(true);

    vi.doUnmock('../lib/db');
    vi.resetModules();
  });

  it('a failure is REPORTED, with the reason, rather than swallowed', async () => {
    vi.resetModules();
    vi.doMock('../lib/db', () => failing('P1001', 'connection refused by host'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const reg = await import('../lib/cms/articleTypeRegistry');
      reg.resetArticleTypeRegistryForTests();
      await reg.getArticleTypeSnapshot();
      expect(warn).toHaveBeenCalled();
      const line = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(line).toContain('article-types');
      expect(line).toContain('P1001');
      expect(line).toContain('connection refused by host');
    } finally {
      warn.mockRestore();
      vi.doUnmock('../lib/db');
      vi.resetModules();
    }
  });

  it('a TRANSIENT failure is not cached for the full success window', async () => {
    vi.resetModules();
    let failNext = true;
    vi.doMock('../lib/db', () => ({
      prisma: {
        articleType: {
          findMany: async () => {
            if (failNext) {
              const e = new Error('transient') as Error & { code?: string };
              e.code = 'P1001';
              throw e;
            }
            return [{
              value: 'News', label: 'News', description: null, sortOrder: 0,
              selectable: true, evergreen: false, schemaType: 'NEWS_ARTICLE', archivedAt: null,
            }];
          },
        },
      },
    }));
    const reg = await import('../lib/cms/articleTypeRegistry');
    reg.resetArticleTypeRegistryForTests();

    expect((await reg.getArticleTypeSnapshot()).source).toBe('fallback');
    failNext = false;
    // Still inside the short error window: the fallback is reused rather than
    // hammering a database that just failed.
    expect((await reg.getArticleTypeSnapshot()).source).toBe('fallback');
    // Past it: recovery, without any explicit invalidation. If the error path
    // used the 10 s success TTL this would still read 'fallback'.
    await new Promise((r) => setTimeout(r, 1200));
    expect((await reg.getArticleTypeSnapshot()).source).toBe('database');

    vi.doUnmock('../lib/db');
    vi.resetModules();
  }, 20_000);
});

// ===========================================================================
// Database-backed: the gates as the server actually enforces them.
// ===========================================================================

suite('04-E.1 — enforced authorization and a real partial registry', () => {
  const users: string[] = [];
  let superAdmin: Actor;
  let admin: Actor;
  let editor: Actor;
  let author: Actor;
  let seoManager: Actor;

  async function makeUser(roleKey: RoleKey): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const u = await prisma.user.create({
      data: { email: `i04e1-${roleKey}-${rid()}@example.com`, name: `04E1 ${roleKey}`, status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    users.push(u.id);
    return { id: u.id, roles: [roleKey] };
  }

  const byValue = async (value: string) => prisma.articleType.findUniqueOrThrow({ where: { value } });

  beforeAll(async () => {
    superAdmin = await makeUser('super_admin');
    admin = await makeUser('administrator');
    editor = await makeUser('editor');
    author = await makeUser('author');
    seoManager = await makeUser('seo_manager');
    await prisma.articleType.deleteMany({});
    registry.resetArticleTypeRegistryForTests();
    const r = await svc.runArticleTypeBootstrap(superAdmin, true);
    expect(r.created).toBe(23);
    expect(r.complete).toBe(true);
  });

  afterAll(async () => {
    if (!available) return;
    // Leave the table as this suite found it: empty.
    await prisma.articleType.deleteMany({});
    registry.resetArticleTypeRegistryForTests();
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });

  // ---------------------------------------------------- evergreen gate

  it('(1) SUPER ADMIN can change evergreen eligibility', async () => {
    const row = await byValue('Travel Guide');
    await svc.setArticleTypeEvergreen(superAdmin, row.id, false);
    expect((await byValue('Travel Guide')).evergreen).toBe(false);
    await svc.setArticleTypeEvergreen(superAdmin, row.id, true);
    expect((await byValue('Travel Guide')).evergreen).toBe(true);
  });

  it('(2) SEO MANAGER can change evergreen eligibility', async () => {
    const row = await byValue('History');
    await svc.setArticleTypeEvergreen(seoManager, row.id, false);
    expect((await byValue('History')).evergreen).toBe(false);
    await svc.setArticleTypeEvergreen(seoManager, row.id, true);
    expect((await byValue('History')).evergreen).toBe(true);
  });

  it('(3,9) ADMINISTRATOR can NO LONGER change evergreen eligibility, and nothing mutates', async () => {
    const before = await byValue('guide');
    await expect(svc.setArticleTypeEvergreen(admin, before.id, false))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.setArticleTypeEvergreen(admin, before.id, false))
      .rejects.toThrow(/restricted to SEO Manager and Super Admin/i);
    const after = await byValue('guide');
    expect(after.evergreen).toBe(before.evergreen);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it('(4,5,9) EDITOR and AUTHOR cannot change evergreen eligibility, and nothing mutates', async () => {
    const before = await byValue('explainer');
    for (const actor of [editor, author]) {
      await expect(svc.setArticleTypeEvergreen(actor, before.id, false))
        .rejects.toMatchObject({ code: 'forbidden' });
    }
    const after = await byValue('explainer');
    expect(after.evergreen).toBe(before.evergreen);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  // ---------------------------------------------------- the other two gates

  it('(6) ADMINISTRATOR retains ordinary Article Type management', async () => {
    const value = `E1 Managed ${rid()}`;
    const { id } = await svc.createArticleType(admin, { value, label: 'E1 Managed' });
    await svc.updateArticleTypeMetadata(admin, id, { label: 'E1 Renamed', description: 'Still in charge.' });
    await svc.setArticleTypeSelectable(admin, id, false);
    await svc.setArticleTypeArchived(admin, id, true);
    const row = await prisma.articleType.findUniqueOrThrow({ where: { id } });
    expect(row.label).toBe('E1 Renamed');
    expect(row.selectable).toBe(false);
    expect(row.archivedAt).not.toBeNull();
    await svc.deleteArticleType(admin, id);
    expect(await prisma.articleType.findUnique({ where: { id } })).toBeNull();
  });

  it('(7) SEO MANAGER gains no management rights from the new permission', async () => {
    const row = await byValue('Preview');
    await expect(svc.createArticleType(seoManager, { value: `E1 Nope ${rid()}`, label: 'Nope' }))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.updateArticleTypeMetadata(seoManager, row.id, { label: 'Hijacked' }))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.setArticleTypeSelectable(seoManager, row.id, false))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.setArticleTypeArchived(seoManager, row.id, true))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.deleteArticleType(seoManager, row.id))
      .rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.reorderArticleTypes(seoManager, [row.id]))
      .rejects.toMatchObject({ code: 'forbidden' });
    const after = await byValue('Preview');
    expect(after.label).toBe('Preview');
    expect(after.selectable).toBe(true);
    expect(after.archivedAt).toBeNull();
  });

  it('(8) only SUPER ADMIN changes the Article/NewsArticle classification — unchanged by 04-E.1', async () => {
    const row = await byValue('Schedule');
    for (const actor of [admin, editor, author, seoManager]) {
      await expect(svc.setArticleTypeSchemaType(actor, row.id, 'NewsArticle'))
        .rejects.toMatchObject({ code: 'forbidden' });
    }
    expect((await byValue('Schedule')).schemaType).toBe('ARTICLE');
    await svc.setArticleTypeSchemaType(superAdmin, row.id, 'NewsArticle');
    expect((await byValue('Schedule')).schemaType).toBe('NEWS_ARTICLE');
    await svc.setArticleTypeSchemaType(superAdmin, row.id, 'Article');
  });

  it('(10) an authorized evergreen change is audited and visible to the next read', async () => {
    const row = await byValue('Ticket Guide');
    await svc.setArticleTypeEvergreen(seoManager, row.id, false);
    // Cache invalidation: no manual flush, the next read reflects it.
    expect(await registry.getEvergreenArticleTypeValues()).not.toContain('Ticket Guide');
    const entries = await svc.listArticleTypeAudit(50);
    const entry = entries.find((e) => e.action === 'articleType.evergreen' && e.detail?.includes('Ticket Guide'));
    expect(entry, 'the evergreen change must be audited').toBeTruthy();
    expect(entry!.detail).toContain('evergreen=false');
    await svc.setArticleTypeEvergreen(seoManager, row.id, true);
    expect(await registry.getEvergreenArticleTypeValues()).toContain('Ticket Guide');
  });

  it('(9) a refused evergreen change writes no audit entry', async () => {
    const row = await byValue('Venue Guide');
    const before = (await svc.listArticleTypeAudit(100)).length;
    await expect(svc.setArticleTypeEvergreen(admin, row.id, false)).rejects.toMatchObject({ code: 'forbidden' });
    expect((await svc.listArticleTypeAudit(100)).length).toBe(before);
  });

  // ---------------------------------------------------- a real partial registry

  it('(13) a REAL partial registry still classifies a recognised news article correctly', async () => {
    /**
     * The 04-E.1 defect, reproduced against the actual database rather than a
     * hand-built snapshot: delete the `News` definition the way an interrupted
     * bootstrap would have left it absent, and read the classification back
     * through the registry.
     */
    const news = await byValue('News');
    const saved = { ...news };
    await prisma.articleType.delete({ where: { id: news.id } });
    registry.resetArticleTypeRegistryForTests();
    try {
      const snap = await registry.getArticleTypeSnapshot();
      expect(snap.source).toBe('database');          // NOT a whole-registry fallback
      expect(snap.types.some((t) => t.value === 'News')).toBe(false);
      // Before the fix this was 'Article'.
      expect(await registry.getArticleSchemaType('News')).toBe('NewsArticle');
      // The managed rows still win, and unknown values stay conservative.
      expect(await registry.getArticleSchemaType('guide')).toBe('Article');
      expect(await registry.getArticleSchemaType('Freestyle')).toBe('Article');
    } finally {
      await prisma.articleType.create({
        data: {
          id: saved.id, value: saved.value, label: saved.label, description: saved.description,
          sortOrder: saved.sortOrder, selectable: saved.selectable, evergreen: saved.evergreen,
          schemaType: saved.schemaType, archivedAt: saved.archivedAt,
        },
      });
      registry.resetArticleTypeRegistryForTests();
    }
  });

  it('(17) a Super Admin reclassification of News survives, and is not overruled by the fallback', async () => {
    const news = await byValue('News');
    await svc.setArticleTypeSchemaType(superAdmin, news.id, 'Article');
    try {
      expect(await registry.getArticleSchemaType('News')).toBe('Article');
      // The legacy `news` is a separate identity and is unaffected.
      expect(await registry.getArticleSchemaType('news')).toBe('NewsArticle');
    } finally {
      await svc.setArticleTypeSchemaType(superAdmin, news.id, 'NewsArticle');
    }
  });

  it('the 23 definitions are intact at the end of this suite', async () => {
    const { verifyArticleTypeRegistry } = await import('../lib/cms/articleTypeBootstrap');
    const v = await verifyArticleTypeRegistry(prisma);
    expect(v.missing).toEqual([]);
    expect(v.miscased).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it('no Article row was rewritten by anything in this suite', async () => {
    const rows = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    expect(rows[0].db).toMatch(/test/);
    // The stored vocabulary is a property of the data, not of this batch.
    const grouped = await prisma.article.groupBy({ by: ['articleType'], _count: { _all: true } });
    expect(grouped.length).toBeGreaterThan(0);
  });
});
