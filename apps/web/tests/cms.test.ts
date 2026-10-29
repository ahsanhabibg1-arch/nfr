import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type * as Svc from '../lib/cms/articleService';
import type * as Session from '../lib/auth/session';
import type * as Pw from '../lib/auth/password';
import type * as Repo from '../lib/content';

/**
 * Authentication + RBAC + CMS persistence integration (Batch 03 §13).
 * Exercises the REAL service/session/password/repository against the test DB.
 * Self-skips without a reachable DATABASE_URL. Creates its own users/articles
 * (prefixed `sectest`) and cleans them up.
 */

let available = false;
let prisma: PrismaClient;
let svc: typeof Svc;
let session: typeof Session;
let pw: typeof Pw;
let repo: typeof Repo;

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    available = true;
    svc = await import('../lib/cms/articleService');
    session = await import('../lib/auth/session');
    pw = await import('../lib/auth/password');
    repo = await import('../lib/content');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
  } catch {
    available = false;
  }
}

const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 10);

suite('CMS auth / RBAC / persistence integration', () => {
  const actors: Record<string, Svc.ActorContext> = {};
  const createdArticleIds: string[] = [];

  async function makeUser(roleKey: string): Promise<Svc.ActorContext> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const user = await prisma.user.create({
      data: { email: `sectest-${roleKey}-${rid()}@example.com`, name: `Sec ${roleKey}`, status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    return { id: user.id, roles: [roleKey] as Svc.ActorContext['roles'] };
  }

  function baseInput(overrides: Partial<Svc.ArticleInput> = {}): Svc.ArticleInput {
    return {
      slug: `sectest-${rid()}`,
      title: 'Security Test Dispatch Headline',
      excerpt: 'A valid editorial excerpt that is long enough to satisfy the publication gate checks.',
      blocks: [
        { type: 'paragraph', text: 'Opening paragraph with a reasonable number of words for the gate.' },
        { type: 'heading', level: 2, text: 'A Section Heading' },
      ],
      categoryName: 'NFR Competition',
      authorName: 'Sec Tester',
      imageRightsStatus: 'Staff Photo',
      imageAltText: 'A descriptive alt text for the featured test photograph.',
      ...overrides,
    } as Svc.ArticleInput;
  }

  const track = <T extends { id: string }>(r: T): T => { createdArticleIds.push(r.id); return r; };

  beforeAll(async () => {
    actors.super = await makeUser('super_admin');
    actors.editor = await makeUser('editor');
    actors.author = await makeUser('author');
    actors.authorB = await makeUser('author');
    actors.seo = await makeUser('seo_manager');
  });

  afterAll(async () => {
    if (!available) return;
    await prisma.article.deleteMany({ where: { slug: { startsWith: 'sectest-' } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'sectest-' } } });
    await prisma.$disconnect();
  });

  // ---- Sessions (§13: 1-4, 20) ----
  it('login verification: correct password verifies, wrong password fails', async () => {
    const hash = await pw.hashPassword('a-sufficiently-long-password');
    expect(await pw.verifyPassword('a-sufficiently-long-password', hash)).toBe(true);
    expect(await pw.verifyPassword('incorrect-password-value', hash)).toBe(false);
  });

  it('session create → validate → invalidate (logout)', async () => {
    const { token } = await session.createSession(actors.editor.id);
    const valid = await session.validateSessionToken(token);
    expect(valid?.user.id).toBe(actors.editor.id);
    await session.invalidateSessionToken(token);
    expect(await session.validateSessionToken(token)).toBeNull();
  });

  it('expired sessions are rejected', async () => {
    const token = crypto.randomBytes(16).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await prisma.session.create({ data: { userId: actors.editor.id, tokenHash, expiresAt: new Date(Date.now() - 1000) } });
    expect(await session.validateSessionToken(token)).toBeNull();
  });

  // ---- RBAC at the service boundary (§13: 7-13) ----
  it('unauthorized role rejection: SEO Manager cannot create articles', async () => {
    await expect(svc.saveArticle(actors.seo, baseInput())).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('Author can create and edit their OWN draft', async () => {
    const created = track(await svc.saveArticle(actors.author, baseInput()));
    const updated = await svc.saveArticle(actors.author, baseInput({ id: created.id, slug: created.slug, expectedVersion: created.version, title: 'Edited By Owner' }));
    expect(updated.version).toBeGreaterThan(created.version);
  });

  it('Author ownership restriction: a different Author cannot edit it', async () => {
    const created = track(await svc.saveArticle(actors.author, baseInput()));
    await expect(
      svc.saveArticle(actors.authorB, baseInput({ id: created.id, slug: created.slug, expectedVersion: created.version })),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('privilege escalation blocked: Author cannot publish an approved article', async () => {
    const created = track(await svc.saveArticle(actors.super, baseInput()));
    const r1 = await svc.transitionWorkflow(actors.super, created.id, 'IN_REVIEW', created.version);
    const r2 = await svc.transitionWorkflow(actors.super, created.id, 'APPROVED', r1.version);
    await expect(svc.transitionWorkflow(actors.author, created.id, 'PUBLISHED', r2.version)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('delete policy: Author cannot delete; Super Admin can', async () => {
    const created = track(await svc.saveArticle(actors.super, baseInput()));
    await expect(svc.deleteArticle(actors.author, created.id)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(svc.deleteArticle(actors.super, created.id)).resolves.toBeTruthy();
  });

  // ---- Workflow enforcement (§13: 16) ----
  it('invalid transitions are rejected (draft cannot jump straight to published)', async () => {
    const created = track(await svc.saveArticle(actors.super, baseInput()));
    await expect(svc.transitionWorkflow(actors.super, created.id, 'PUBLISHED', created.version)).rejects.toMatchObject({ code: 'invalid_transition' });
  });

  it('publication gate blocks going live with unresolved image rights', async () => {
    const created = track(await svc.saveArticle(actors.super, baseInput({ imageRightsStatus: 'Unresolved' })));
    const r1 = await svc.transitionWorkflow(actors.super, created.id, 'IN_REVIEW', created.version);
    const r2 = await svc.transitionWorkflow(actors.super, created.id, 'APPROVED', r1.version);
    await expect(svc.transitionWorkflow(actors.super, created.id, 'PUBLISHED', r2.version)).rejects.toMatchObject({ code: 'validation' });
  });

  // ---- Persistence, revisions, audit (§13: 14, 15, 21) ----
  it('article create/update persists to PostgreSQL with revisions + audit', async () => {
    const created = track(await svc.saveArticle(actors.editor, baseInput()));
    await svc.saveArticle(actors.editor, baseInput({ id: created.id, slug: created.slug, expectedVersion: created.version, title: 'Revised Title' }));
    const row = await prisma.article.findUnique({ where: { id: created.id } });
    expect(row?.title).toBe('Revised Title');
    expect(await prisma.articleRevision.count({ where: { articleId: created.id } })).toBeGreaterThanOrEqual(2);
    expect(await prisma.auditLog.count({ where: { entityId: created.id } })).toBeGreaterThan(0);
  });

  it('concurrent edit conflict: a stale expectedVersion is rejected', async () => {
    const created = track(await svc.saveArticle(actors.editor, baseInput()));
    await svc.saveArticle(actors.editor, baseInput({ id: created.id, slug: created.slug, expectedVersion: created.version })); // -> version 2
    await expect(
      svc.saveArticle(actors.editor, baseInput({ id: created.id, slug: created.slug, expectedVersion: created.version })), // stale (still 1)
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  // ---- Publish → public visibility + unpublish privacy (§13: 17, 18, 19) ----
  it('draft is private; publish makes it public; unpublish removes it', async () => {
    const created = track(await svc.saveArticle(actors.super, baseInput()));
    // Draft privacy
    expect(await repo.getPublishedArticleBySlug(created.slug)).toBeNull();
    // Promote to published
    const r1 = await svc.transitionWorkflow(actors.super, created.id, 'IN_REVIEW', created.version);
    const r2 = await svc.transitionWorkflow(actors.super, created.id, 'APPROVED', r1.version);
    const r3 = await svc.transitionWorkflow(actors.super, created.id, 'PUBLISHED', r2.version);
    expect(r3.becamePublic).toBe(true);
    const published = await repo.getPublishedArticleBySlug(created.slug);
    expect(published?.slug).toBe(created.slug);
    // Unpublish
    const r4 = await svc.transitionWorkflow(actors.super, created.id, 'DRAFT', r3.version);
    expect(r4.becamePrivate).toBe(true);
    expect(await repo.getPublishedArticleBySlug(created.slug)).toBeNull();
  });
});
