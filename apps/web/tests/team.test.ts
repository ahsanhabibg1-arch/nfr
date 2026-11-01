import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { RoleKey } from '../lib/auth/rbac';
import type { Actor } from '../lib/cms/guard';
import type * as TeamSvc from '../lib/cms/teamService';

/**
 * Batch 09 — team & account security integration (§27 items 1–16). Exercises the real
 * services + DB: invitation token (hash/expiry/single-use), activation, suspension +
 * session revocation, suspended-session rejection, role-assignment authorization,
 * self-escalation rejection, last Super Admin protection, password change + session
 * invalidation, and password reset token security. Self-skips without DATABASE_URL.
 */
let available = false;
let prisma: PrismaClient;
let team: typeof TeamSvc;
let invites: typeof import('../lib/auth/invitations');
let session: typeof import('../lib/auth/session');
let password: typeof import('../lib/auth/password');

if (process.env.DATABASE_URL) {
  try {
    const dbmod = await import('../lib/db');
    prisma = dbmod.prisma as PrismaClient;
    await prisma.$queryRaw`SELECT 1`;
    available = true;
    team = await import('../lib/cms/teamService');
    invites = await import('../lib/auth/invitations');
    session = await import('../lib/auth/session');
    password = await import('../lib/auth/password');
    const roleSync = await import('../lib/auth/roleSync');
    await roleSync.syncRolesAndPermissions(prisma);
  } catch {
    available = false;
  }
}
const suite = available ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 8);

suite('Batch 09 — team & account security', () => {
  const actors: Record<string, Actor> = {};
  const userIds: string[] = [];
  const emails: string[] = [];

  async function makeUser(roleKey: RoleKey, status: 'ACTIVE' | 'SUSPENDED' | 'INVITED' = 'ACTIVE'): Promise<Actor> {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const email = `b9-${roleKey}-${rid()}@example.com`;
    const u = await prisma.user.create({ data: { email, name: `B9 ${roleKey}`, status, passwordHash: await password.hashPassword('correct horse battery staple') } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    userIds.push(u.id); emails.push(email);
    return { id: u.id, roles: [roleKey] };
  }

  beforeAll(async () => {
    actors.superadmin = await makeUser('super_admin');
    actors.admin = await makeUser('administrator');
    actors.editor = await makeUser('editor');
    actors.author = await makeUser('author');
  });

  afterAll(async () => {
    if (!available) return;
    await prisma.staffInvitation.deleteMany({ where: { email: { in: emails } } }).catch(() => {});
    for (const id of userIds) {
      await prisma.passwordResetToken.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.session.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.userRole.deleteMany({ where: { userId: id } }).catch(() => {});
      await prisma.user.delete({ where: { id } }).catch(() => {});
    }
  });

  it('creates an invitation with a hashed, single-use token; accept activates the account', async () => {
    const email = `b9-invite-${rid()}@example.com`;
    emails.push(email);
    const res = await team.createInvitation(actors.admin, { email, name: 'Invited Person', roleKey: 'author' });
    userIds.push(res.userId);
    // token is hashed at rest (never stored raw)
    const inv = await prisma.staffInvitation.findUnique({ where: { tokenHash: invites.hashToken(res.token) } });
    expect(inv).not.toBeNull();
    expect(inv!.tokenHash).not.toBe(res.token);
    expect(inv!.tokenHash).toHaveLength(64);
    const invited = await prisma.user.findUnique({ where: { id: res.userId } });
    expect(invited?.status).toBe('INVITED');
    expect(invited?.passwordHash).toBeNull();

    await team.acceptInvitation({ token: res.token, password: 'a-strong-password-123' });
    const active = await prisma.user.findUnique({ where: { id: res.userId } });
    expect(active?.status).toBe('ACTIVE');
    expect(active?.passwordHash).toBeTruthy();
    // single use
    await expect(team.acceptInvitation({ token: res.token, password: 'another-password-123' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects an expired invitation', async () => {
    const email = `b9-exp-${rid()}@example.com`;
    emails.push(email);
    const res = await team.createInvitation(actors.admin, { email, name: 'Expired', roleKey: 'author' });
    userIds.push(res.userId);
    await prisma.staffInvitation.update({ where: { tokenHash: invites.hashToken(res.token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(team.acceptInvitation({ token: res.token, password: 'a-strong-password-123' })).rejects.toMatchObject({ code: 'conflict' });
  });

  it('rejects weak passwords on accept', async () => {
    const email = `b9-weak-${rid()}@example.com`;
    emails.push(email);
    const res = await team.createInvitation(actors.admin, { email, name: 'Weak', roleKey: 'author' });
    userIds.push(res.userId);
    await expect(team.acceptInvitation({ token: res.token, password: 'short' })).rejects.toMatchObject({ code: 'validation' });
  });

  it('suspension revokes sessions and a suspended account cannot authenticate', async () => {
    const target = await makeUser('author');
    const { token } = await session.createSession(target.id);
    expect(await session.validateSessionToken(token)).not.toBeNull();
    await team.setStaffStatus(actors.admin, target.id, 'SUSPENDED');
    // sessions deleted by suspension
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
    // and even a surviving session would be rejected by the status guard
    const { token: t2 } = await session.createSession(target.id);
    expect(await session.validateSessionToken(t2)).toBeNull();
  });

  it('enforces role-assignment authorization + self-protection', async () => {
    const target = await makeUser('author');
    // editor lacks role.assign
    await expect(team.assignRoles(actors.editor, target.id, { roleKeys: ['editor'] })).rejects.toMatchObject({ code: 'forbidden' });
    // cannot change your own roles
    await expect(team.assignRoles(actors.admin, actors.admin.id, { roleKeys: ['super_admin'] })).rejects.toMatchObject({ code: 'forbidden' });
    // administrator cannot grant super_admin (only a super admin can)
    await expect(team.assignRoles(actors.admin, target.id, { roleKeys: ['super_admin'] })).rejects.toMatchObject({ code: 'forbidden' });
    // admin can assign an ordinary role; sessions get revoked
    await session.createSession(target.id);
    await team.assignRoles(actors.admin, target.id, { roleKeys: ['editor'] });
    const roles = await prisma.userRole.findMany({ where: { userId: target.id }, select: { role: { select: { key: true } } } });
    expect(roles.map((r) => r.role.key)).toEqual(['editor']);
    expect(await prisma.session.count({ where: { userId: target.id } })).toBe(0);
    // a super admin CAN grant super_admin
    await team.assignRoles(actors.superadmin, target.id, { roleKeys: ['super_admin'] });
    const roles2 = await prisma.userRole.findMany({ where: { userId: target.id }, select: { role: { select: { key: true } } } });
    expect(roles2.map((r) => r.role.key)).toEqual(['super_admin']);
  });

  it('protects the last active Super Admin', async () => {
    const lone = await makeUser('super_admin');
    // Force `lone` to be the ONLY active super admin (test DB has no legitimate persistent SA).
    await prisma.user.updateMany({ where: { status: 'ACTIVE', id: { not: lone.id }, roles: { some: { role: { key: 'super_admin' } } } }, data: { status: 'SUSPENDED' } });
    // An administrator cannot suspend the last active super admin.
    await expect(team.setStaffStatus(actors.admin, lone.id, 'SUSPENDED')).rejects.toMatchObject({ code: 'conflict' });
    // A super admin cannot demote the last active super admin either.
    await expect(team.assignRoles(actors.superadmin, lone.id, { roleKeys: ['editor'] })).rejects.toMatchObject({ code: 'conflict' });
    // restore the others we suspended for isolation
    await prisma.user.updateMany({ where: { id: actors.superadmin.id }, data: { status: 'ACTIVE' } });
  });

  it('changes password with current-password verification + revokes other sessions', async () => {
    const u = await makeUser('author');
    const { token: keep } = await session.createSession(u.id);
    await session.createSession(u.id); // a second session to be revoked
    await expect(team.changeOwnPassword(u, { currentPassword: 'wrong', newPassword: 'brand-new-password-123' }, keep)).rejects.toMatchObject({ code: 'forbidden' });
    await team.changeOwnPassword(u, { currentPassword: 'correct horse battery staple', newPassword: 'brand-new-password-123' }, keep);
    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(await password.verifyPassword('brand-new-password-123', after!.passwordHash!)).toBe(true);
    // the acting session is kept; others revoked
    const remaining = await prisma.session.findMany({ where: { userId: u.id }, select: { tokenHash: true } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].tokenHash).toBe(invites.hashToken(keep));
  });

  it('password reset token is hashed, single-use, and revokes sessions', async () => {
    const u = await makeUser('author');
    await session.createSession(u.id);
    const res = await team.createPasswordReset(actors.admin, u.id);
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: invites.hashToken(res.token) } });
    expect(row).not.toBeNull();
    expect(row!.tokenHash).not.toBe(res.token);
    await team.consumePasswordReset({ token: res.token, newPassword: 'reset-password-value-123' });
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(await password.verifyPassword('reset-password-value-123', after!.passwordHash!)).toBe(true);
    // single use
    await expect(team.consumePasswordReset({ token: res.token, newPassword: 'again-password-value-123' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('listStaff never leaks password hashes or tokens', async () => {
    const rows = await team.listStaff(actors.admin, {});
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toMatch(/passwordHash|tokenHash|\$2[aby]\$/);
    expect(rows.length).toBeGreaterThan(0);
  });
});
