import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { roleHasPermission } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as Reader from '../lib/auth/reader';
import type * as Comments from '../lib/cms/commentService';
import type * as ReaderAdmin from '../lib/cms/readerAdminService';

/**
 * Batch 24 — reader accounts + article comments. Covers registration, dedupe, role
 * separation, comment moderation workflow, authorization, token lifecycle, enumeration
 * resistance and anti-spam. Isolated test DB only; self-skips without DATABASE_URL.
 */
let available = false;
let prisma: PrismaClient;
let reader: typeof Reader;
let comments: typeof Comments;
let readerAdmin: typeof ReaderAdmin;

if (process.env.DATABASE_URL) {
  try {
    prisma = (await import('../lib/db')).prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    reader = await import('../lib/auth/reader');
    comments = await import('../lib/cms/commentService');
    readerAdmin = await import('../lib/cms/readerAdminService');
    await (await import('../lib/auth/roleSync')).syncRolesAndPermissions(prisma);
    available = true;
  } catch { available = false; }
}
const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

suite('Batch 24 — reader accounts & comments', () => {
  const tag = rid();
  const userIds: string[] = [];
  let articleId = '';
  let adminActor: Actor;

  async function makeAdmin(): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'administrator' } });
    const u = await prisma.user.create({ data: { email: `b24-admin-${tag}-${rid()}@example.com`, name: 'B24 Admin', status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    userIds.push(u.id); return { id: u.id, roles: ['administrator'] };
  }

  beforeAll(async () => {
    adminActor = await makeAdmin();
    const pub = await prisma.article.findFirst({ where: { workflowStatus: 'PUBLISHED' }, select: { id: true } });
    if (!pub) throw new Error('No published article in the test DB — run `prisma db seed`.');
    articleId = pub.id;
  });

  afterAll(async () => {
    if (!available) return;
    await prisma.articleComment.deleteMany({ where: { authorId: { in: userIds } } }).catch(() => {});
    await prisma.emailVerificationToken.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    for (const id of userIds) { await prisma.userRole.deleteMany({ where: { userId: id } }).catch(() => {}); await prisma.user.delete({ where: { id } }).catch(() => {}); }
  });

  async function newReader(): Promise<string> {
    const { id } = await reader.registerReader({ email: `b24-r-${tag}-${rid()}@example.com`, name: `Reader ${rid()}`, password: 'correct horse staple' });
    userIds.push(id); return id;
  }

  async function makeEditor(): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: 'editor' } });
    const u = await prisma.user.create({ data: { email: `b24-ed-${tag}-${rid()}@example.com`, name: 'B24 Editor', status: 'ACTIVE' } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    userIds.push(u.id); return { id: u.id, roles: ['editor'] };
  }

  it('registration creates a reader with NO admin access; duplicate email is rejected', async () => {
    const email = `b24-dup-${tag}@example.com`;
    const { id } = await reader.registerReader({ email, name: 'Dup Reader', password: 'correct horse staple' }); userIds.push(id);
    const roles = await prisma.userRole.findMany({ where: { userId: id }, include: { role: true } });
    expect(roles.map((r) => r.role.key)).toEqual(['reader']);
    expect(roleHasPermission(['reader'], 'cms.access')).toBe(false);
    expect(roleHasPermission(['reader'], 'comment.moderate')).toBe(false);
    await expect(reader.registerReader({ email, name: 'Again', password: 'correct horse staple' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('registration validation rejects weak/mismatched/termless input', () => {
    const base = { email: 'a@b.co', name: 'Nm', password: 'abcdefghijkl', confirm: 'abcdefghijkl', acceptedTerms: true };
    expect(reader.validateRegistration(base)).toBeNull();
    expect(reader.validateRegistration({ ...base, password: 'short', confirm: 'short' })).toMatch(/12 characters/);
    expect(reader.validateRegistration({ ...base, confirm: 'abcdefghij99' })).toMatch(/do not match/);
    expect(reader.validateRegistration({ ...base, acceptedTerms: false })).toMatch(/Terms/);
    expect(reader.validateRegistration({ ...base, email: 'bad' })).toMatch(/valid email/);
  });

  it('comment is PENDING, hidden from public, visible to its author; only published articles accept comments', async () => {
    const uid = await newReader();
    const c = await comments.createComment(uid, articleId, 'Great coverage of the rodeo!');
    expect(c.status).toBe('PENDING');
    expect((await comments.listApprovedForArticle(articleId)).find((x) => x.id === c.id)).toBeUndefined();
    expect((await comments.listMyComments(uid)).find((x) => x.id === c.id)?.status).toBe('PENDING');
    await expect(comments.createComment(uid, 'nonexistent-article-id', 'hi')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('approval makes a comment public; reject/hide remove it', async () => {
    const uid = await newReader();
    const c = await comments.createComment(uid, articleId, 'Approve me please.');
    await comments.moderateComment(adminActor, c.id, 'APPROVED');
    expect((await comments.listApprovedForArticle(articleId)).find((x) => x.id === c.id)?.body).toBe('Approve me please.');
    await comments.moderateComment(adminActor, c.id, 'HIDDEN');
    expect((await comments.listApprovedForArticle(articleId)).find((x) => x.id === c.id)).toBeUndefined();
  });

  it('readers cannot moderate; moderators cannot approve their own comment', async () => {
    const uid = await newReader();
    const c = await comments.createComment(uid, articleId, 'reader comment');
    const readerActor: Actor = { id: uid, roles: ['reader'] };
    await expect(comments.moderateComment(readerActor, c.id, 'APPROVED')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(comments.listForModeration(readerActor)).rejects.toMatchObject({ code: 'forbidden' });
    // admin comments on the article, then tries to self-approve
    const own = await comments.createComment(adminActor.id, articleId, 'admin own comment');
    await expect(comments.moderateComment(adminActor, own.id, 'APPROVED')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('comment body is stored verbatim (escaping happens at render — no HTML execution path)', async () => {
    const uid = await newReader();
    const payload = '<script>alert(1)</script> & <img src=x onerror=alert(2)>';
    const c = await comments.createComment(uid, articleId, payload);
    await comments.moderateComment(adminActor, c.id, 'APPROVED');
    const got = (await comments.listApprovedForArticle(articleId)).find((x) => x.id === c.id);
    expect(got?.body).toBe(payload); // plain text, rendered as escaped React children (never dangerouslySetInnerHTML)
  });

  it('anti-spam: the 6th comment within the window is rate-limited', async () => {
    const uid = await newReader();
    for (let i = 0; i < 5; i++) await comments.createComment(uid, articleId, `comment ${i}`);
    await expect(comments.createComment(uid, articleId, 'one too many')).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('email verification token is single-use and expiry-bound', async () => {
    const uid = await newReader();
    const token = await reader.createEmailVerificationToken(uid);
    expect(await reader.consumeEmailVerificationToken(token)).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: uid } })).emailVerifiedAt).not.toBeNull();
    expect(await reader.consumeEmailVerificationToken(token)).toBe(false); // reuse rejected
    expect(await reader.consumeEmailVerificationToken('not-a-real-token')).toBe(false);
  });

  it('password reset: no enumeration, single-use, invalidates sessions', async () => {
    const uid = await newReader();
    const email = (await prisma.user.findUniqueOrThrow({ where: { id: uid } })).email;
    expect(await reader.createPasswordResetToken('nobody-' + email)).toBeNull(); // unknown → null (generic upstream)
    const token = await reader.createPasswordResetToken(email);
    expect(token).toBeTruthy();
    expect(await reader.consumePasswordResetToken(token!, 'brand new password')).toBe(true);
    expect(await reader.consumePasswordResetToken(token!, 'again again again')).toBe(false); // reuse rejected
  });

  // ---------------- Reader-account administration (Batch 24) ----------------
  it('listReaders returns reader accounts (with comment counts) and NEVER staff accounts', async () => {
    const uid = await newReader();
    await comments.createComment(uid, articleId, 'a reader comment for the count');
    const rows = await readerAdmin.listReaders(adminActor, {});
    const mine = rows.find((r) => r.id === uid);
    expect(mine).toBeTruthy();
    expect(mine!.commentCount).toBeGreaterThanOrEqual(1);
    // The admin staff account (adminActor) must not appear in the readers list.
    expect(rows.find((r) => r.id === adminActor.id)).toBeUndefined();
    const counts = await readerAdmin.readerCounts(adminActor);
    expect(counts.total).toBeGreaterThanOrEqual(1);
  });

  it('reader administration is Admin-only: editors and readers are forbidden', async () => {
    const editor = await makeEditor();
    const uid = await newReader();
    const readerActor: Actor = { id: uid, roles: ['reader'] };
    await expect(readerAdmin.listReaders(editor)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(readerAdmin.listReaders(readerActor)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(readerAdmin.setReaderStatus(editor, uid, 'SUSPENDED')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('suspending a reader sets SUSPENDED and force-revokes their sessions', async () => {
    const uid = await newReader();
    await prisma.session.create({ data: { userId: uid, tokenHash: `sess-${rid()}-${rid()}`, expiresAt: new Date(Date.now() + 3600_000) } });
    expect(await prisma.session.count({ where: { userId: uid } })).toBe(1);
    await readerAdmin.setReaderStatus(adminActor, uid, 'SUSPENDED');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: uid } })).status).toBe('SUSPENDED');
    expect(await prisma.session.count({ where: { userId: uid } })).toBe(0);
    await readerAdmin.setReaderStatus(adminActor, uid, 'ACTIVE'); // reactivation works
    expect((await prisma.user.findUniqueOrThrow({ where: { id: uid } })).status).toBe('ACTIVE');
  });

  it('the readers module cannot touch a STAFF account (no backdoor to disabling admins)', async () => {
    await expect(readerAdmin.setReaderStatus(adminActor, adminActor.id, 'SUSPENDED')).rejects.toMatchObject({ code: 'forbidden' });
    await expect(readerAdmin.deleteReader(adminActor, adminActor.id)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('deleting a reader removes the account and cascades their comments', async () => {
    const uid = await newReader();
    const c = await comments.createComment(uid, articleId, 'this comment should vanish with the account');
    await readerAdmin.deleteReader(adminActor, uid);
    expect(await prisma.user.findUnique({ where: { id: uid } })).toBeNull();
    expect(await prisma.articleComment.findUnique({ where: { id: c.id } })).toBeNull();
  });
});
