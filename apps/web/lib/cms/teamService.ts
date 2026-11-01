import 'server-only';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { Actor, audit } from './guard';
import { roleHasPermission, RoleKey, ALL_ROLES, ROLE_LABELS } from '../auth/rbac';
import { ServiceError } from './articleService';
import { hashPassword, verifyPassword, isAcceptablePassword } from '../auth/password';
import { generateToken, hashToken, INVITE_TTL_MS, RESET_TTL_MS } from '../auth/invitations';

/**
 * Team & account governance service (Batch 09). Default-deny RBAC + audit. Never
 * returns password hashes or raw/hashed tokens. Role/status changes that could affect
 * Super Admin availability run under SERIALIZABLE isolation so the "last active Super
 * Admin" invariant is concurrency-safe (§9/§10). Suspension and privilege removal
 * revoke the affected user's sessions; role resolution is per-request, so grants take
 * effect on the next request.
 */
const need = (a: Actor, p: Parameters<typeof roleHasPermission>[1]) => {
  if (!roleHasPermission(a.roles, p)) throw new ServiceError('forbidden', `Not permitted (${p}).`);
};
const isSuperAdmin = (a: Actor) => a.roles.includes('super_admin');

function sanitizedUserSelect() {
  return {
    id: true, email: true, name: true, status: true, lastLoginAt: true, createdAt: true,
    roles: { select: { role: { select: { key: true, name: true } } } },
    _count: { select: { sessions: true } },
  } satisfies Prisma.UserSelect;
}

export interface StaffRow {
  id: string; email: string; name: string; status: string;
  roles: { key: string; name: string }[]; roleLabel: string;
  lastLoginAt: string | null; createdAt: string; activeSessions: number;
}
function toStaffRow(u: {
  id: string; email: string; name: string; status: string; lastLoginAt: Date | null; createdAt: Date;
  roles: { role: { key: string; name: string } }[]; _count: { sessions: number };
}): StaffRow {
  const roleKeys = u.roles.map((r) => r.role.key as RoleKey);
  const primary = ALL_ROLES.find((r) => roleKeys.includes(r));
  return {
    id: u.id, email: u.email, name: u.name, status: u.status,
    roles: u.roles.map((r) => ({ key: r.role.key, name: r.role.name })),
    roleLabel: primary ? ROLE_LABELS[primary] : 'No Role',
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString(),
    activeSessions: u._count.sessions,
  };
}

// ---------------- Directory ----------------
export interface StaffFilters { q?: string; role?: string; status?: string }
export async function listStaff(actor: Actor, filters: StaffFilters = {}): Promise<StaffRow[]> {
  need(actor, 'user.manage');
  const where: Prisma.UserWhereInput = {};
  if (filters.q) where.OR = [{ name: { contains: filters.q, mode: 'insensitive' } }, { email: { contains: filters.q, mode: 'insensitive' } }];
  if (filters.status && ['ACTIVE', 'INVITED', 'SUSPENDED'].includes(filters.status)) where.status = filters.status as never;
  if (filters.role) where.roles = { some: { role: { key: filters.role } } };
  const rows = await prisma.user.findMany({ where, orderBy: { createdAt: 'asc' }, select: sanitizedUserSelect() });
  return rows.map(toStaffRow);
}

export async function getStaff(actor: Actor, id: string): Promise<{ staff: StaffRow; sessions: { id: string; createdAt: string; ip: string | null; ua: string | null }[]; recentAudit: { action: string; entityType: string; createdAt: string; detail: string | null }[] }> {
  need(actor, 'user.manage');
  const u = await prisma.user.findUnique({ where: { id }, select: sanitizedUserSelect() });
  if (!u) throw new ServiceError('not_found', 'Staff member not found');
  const [sessions, recentAudit] = await Promise.all([
    prisma.session.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, createdAt: true, ipAddress: true, userAgent: true } }),
    prisma.auditLog.findMany({ where: { actorId: id }, orderBy: { createdAt: 'desc' }, take: 20, select: { action: true, entityType: true, createdAt: true, detail: true } }),
  ]);
  return {
    staff: toStaffRow(u),
    sessions: sessions.map((s) => ({ id: s.id, createdAt: s.createdAt.toISOString(), ip: s.ipAddress, ua: s.userAgent })),
    recentAudit: recentAudit.map((a) => ({ action: a.action, entityType: a.entityType, createdAt: a.createdAt.toISOString(), detail: a.detail })),
  };
}

// ---------------- Super Admin protection helpers ----------------
async function activeSuperAdminIds(tx: Prisma.TransactionClient): Promise<string[]> {
  const rows = await tx.user.findMany({ where: { status: 'ACTIVE', roles: { some: { role: { key: 'super_admin' } } } }, select: { id: true } });
  return rows.map((r) => r.id);
}

// ---------------- Invitations ----------------
const InviteInput = z.object({ email: z.string().email().max(200), name: z.string().min(1).max(200), roleKey: z.enum(['super_admin', 'administrator', 'editor', 'author', 'seo_manager']) });
export type InviteInput = z.input<typeof InviteInput>;

/** Create an INVITED user + a single-use invitation token. Returns the raw token ONCE
 * for a manually-shared link (no email is sent). */
export async function createInvitation(actor: Actor, raw: InviteInput): Promise<{ token: string; expiresAt: string; userId: string }> {
  need(actor, 'user.manage');
  need(actor, 'role.assign');
  const v = InviteInput.parse(raw);
  if (v.roleKey === 'super_admin' && !isSuperAdmin(actor)) throw new ServiceError('forbidden', 'Only a Super Admin can invite a Super Admin.');
  const email = v.email.toLowerCase().trim();
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new ServiceError('conflict', 'A user with that email already exists.');
  const role = await prisma.role.findUnique({ where: { key: v.roleKey }, select: { id: true } });
  if (!role) throw new ServiceError('not_found', 'Role not found');
  const { token, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { email, name: v.name, status: 'INVITED' } });
    await tx.userRole.create({ data: { userId: u.id, roleId: role.id } });
    await tx.staffInvitation.create({ data: { email, roleKey: v.roleKey, tokenHash, invitedById: actor.id, expiresAt } });
    return u;
  });
  await audit(actor.id, 'team.invite.create', 'user', user.id, `role=${v.roleKey}`); // token never logged
  return { token, expiresAt: expiresAt.toISOString(), userId: user.id };
}

const AcceptInput = z.object({ token: z.string().min(10).max(200), name: z.string().min(1).max(200).optional(), password: z.string().min(1).max(200) });
export type AcceptInput = z.input<typeof AcceptInput>;

/** Public (no session): accept an invitation, set the password, activate the account. */
export async function acceptInvitation(raw: AcceptInput): Promise<{ ok: true; email: string }> {
  const v = AcceptInput.parse(raw);
  if (!isAcceptablePassword(v.password)) throw new ServiceError('validation', 'Password must be at least 12 characters.');
  const inv = await prisma.staffInvitation.findUnique({ where: { tokenHash: hashToken(v.token) } });
  if (!inv || inv.status !== 'PENDING') throw new ServiceError('not_found', 'Invitation is invalid or already used.');
  if (inv.expiresAt.getTime() < Date.now()) {
    await prisma.staffInvitation.update({ where: { id: inv.id }, data: { status: 'EXPIRED' } }).catch(() => {});
    throw new ServiceError('conflict', 'Invitation has expired.');
  }
  const user = await prisma.user.findUnique({ where: { email: inv.email } });
  if (!user) throw new ServiceError('not_found', 'Account not found for this invitation.');
  const passwordHash = await hashPassword(v.password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, status: 'ACTIVE', ...(v.name ? { name: v.name } : {}) } });
    await tx.staffInvitation.update({ where: { id: inv.id }, data: { status: 'ACCEPTED', usedAt: new Date(), acceptedUserId: user.id } });
  });
  await audit(user.id, 'team.invite.accept', 'user', user.id);
  return { ok: true, email: inv.email };
}

export async function revokeInvitation(actor: Actor, invitationId: string): Promise<void> {
  need(actor, 'user.manage');
  const inv = await prisma.staffInvitation.findUnique({ where: { id: invitationId }, select: { id: true, status: true } });
  if (!inv) throw new ServiceError('not_found', 'Invitation not found');
  await prisma.staffInvitation.update({ where: { id: invitationId }, data: { status: 'REVOKED' } });
  await audit(actor.id, 'team.invite.revoke', 'staff_invitation', invitationId);
}

export async function listInvitations(actor: Actor): Promise<{ id: string; email: string; roleKey: string; status: string; expiresAt: string }[]> {
  need(actor, 'user.manage');
  const rows = await prisma.staffInvitation.findMany({ orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, email: true, roleKey: true, status: true, expiresAt: true } });
  return rows.map((r) => ({ id: r.id, email: r.email, roleKey: r.roleKey, status: r.status, expiresAt: r.expiresAt.toISOString() }));
}

// ---------------- Account status ----------------
export async function setStaffStatus(actor: Actor, userId: string, status: 'ACTIVE' | 'SUSPENDED'): Promise<void> {
  need(actor, 'user.manage');
  if (userId === actor.id) throw new ServiceError('forbidden', 'You cannot change your own account status here.');
  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true, roles: { select: { role: { select: { key: true } } } } } });
    if (!target) throw new ServiceError('not_found', 'Staff member not found');
    if (status === 'SUSPENDED') {
      const targetIsSA = target.roles.some((r) => r.role.key === 'super_admin');
      if (targetIsSA) {
        const sas = await activeSuperAdminIds(tx);
        if (sas.length <= 1 && sas.includes(userId)) throw new ServiceError('conflict', 'Cannot suspend the last active Super Admin.');
      }
    }
    await tx.user.update({ where: { id: userId }, data: { status } });
    if (status === 'SUSPENDED') await tx.session.deleteMany({ where: { userId } }); // revoke access immediately
  }, { isolationLevel: 'Serializable' });
  await audit(actor.id, 'team.status.set', 'user', userId, status);
}

// ---------------- Role assignment ----------------
const RolesInput = z.object({ roleKeys: z.array(z.enum(['super_admin', 'administrator', 'editor', 'author', 'seo_manager'])).min(1).max(5) });
export type RolesInput = z.input<typeof RolesInput>;

export async function assignRoles(actor: Actor, userId: string, raw: RolesInput): Promise<void> {
  need(actor, 'role.assign');
  const v = RolesInput.parse(raw);
  if (userId === actor.id) throw new ServiceError('forbidden', 'You cannot change your own roles.');
  const wantSuper = v.roleKeys.includes('super_admin');
  if (wantSuper && !isSuperAdmin(actor)) throw new ServiceError('forbidden', 'Only a Super Admin can grant Super Admin.');

  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true, status: true, roles: { select: { role: { select: { key: true, id: true } } } } } });
    if (!target) throw new ServiceError('not_found', 'Staff member not found');
    const hadSuper = target.roles.some((r) => r.role.key === 'super_admin');
    // Only a Super Admin may REMOVE Super Admin from someone.
    if (hadSuper && !wantSuper && !isSuperAdmin(actor)) throw new ServiceError('forbidden', 'Only a Super Admin can remove Super Admin.');
    // Last active Super Admin protection.
    if (hadSuper && !wantSuper && target.status === 'ACTIVE') {
      const sas = await activeSuperAdminIds(tx);
      if (sas.length <= 1 && sas.includes(userId)) throw new ServiceError('conflict', 'Cannot remove the last active Super Admin.');
    }
    const roles = await tx.role.findMany({ where: { key: { in: v.roleKeys } }, select: { id: true } });
    await tx.userRole.deleteMany({ where: { userId } });
    await tx.userRole.createMany({ data: roles.map((r) => ({ userId, roleId: r.id })), skipDuplicates: true });
    // Privilege change: revoke the target's sessions so removals take effect at once.
    await tx.session.deleteMany({ where: { userId } });
  }, { isolationLevel: 'Serializable' });
  await audit(actor.id, 'team.roles.assign', 'user', userId, v.roleKeys.join(','));
}

// ---------------- Sessions ----------------
export async function revokeStaffSessions(actor: Actor, userId: string): Promise<{ revoked: number }> {
  need(actor, 'user.manage');
  const r = await prisma.session.deleteMany({ where: { userId } });
  await audit(actor.id, 'team.sessions.revoke', 'user', userId, `count=${r.count}`);
  return { revoked: r.count };
}

export async function listOwnSessions(actor: Actor, currentToken: string | null): Promise<{ id: string; createdAt: string; ip: string | null; ua: string | null; current: boolean }[]> {
  const currentHash = currentToken ? hashToken(currentToken) : null;
  const rows = await prisma.session.findMany({ where: { userId: actor.id }, orderBy: { createdAt: 'desc' }, select: { id: true, tokenHash: true, createdAt: true, ipAddress: true, userAgent: true } });
  return rows.map((s) => ({ id: s.id, createdAt: s.createdAt.toISOString(), ip: s.ipAddress, ua: s.userAgent, current: !!currentHash && s.tokenHash === currentHash }));
}

export async function revokeOwnOtherSessions(actor: Actor, currentToken: string | null): Promise<{ revoked: number }> {
  const currentHash = currentToken ? hashToken(currentToken) : null;
  const r = await prisma.session.deleteMany({ where: { userId: actor.id, ...(currentHash ? { tokenHash: { not: currentHash } } : {}) } });
  await audit(actor.id, 'account.sessions.revoke_others', 'user', actor.id, `count=${r.count}`);
  return { revoked: r.count };
}

// ---------------- Password change ----------------
const PwChange = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) });
export type PwChangeInput = z.input<typeof PwChange>;

export async function changeOwnPassword(actor: Actor, raw: PwChangeInput, currentToken: string | null): Promise<void> {
  const v = PwChange.parse(raw);
  if (!isAcceptablePassword(v.newPassword)) throw new ServiceError('validation', 'New password must be at least 12 characters.');
  const user = await prisma.user.findUnique({ where: { id: actor.id }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await verifyPassword(v.currentPassword, user.passwordHash))) throw new ServiceError('forbidden', 'Current password is incorrect.');
  const passwordHash = await hashPassword(v.newPassword);
  const currentHash = currentToken ? hashToken(currentToken) : null;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: actor.id, ...(currentHash ? { tokenHash: { not: currentHash } } : {}) } });
  });
  await audit(actor.id, 'account.password.change', 'user', actor.id); // never log password content
}

// ---------------- Password reset (admin-assisted foundation) ----------------
export async function createPasswordReset(actor: Actor, userId: string): Promise<{ token: string; expiresAt: string }> {
  need(actor, 'user.manage');
  if (!(await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw new ServiceError('not_found', 'Staff member not found');
  const { token, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt, createdById: actor.id } });
  await audit(actor.id, 'team.password_reset.create', 'user', userId); // token never logged
  return { token, expiresAt: expiresAt.toISOString() };
}

const ConsumeReset = z.object({ token: z.string().min(10).max(200), newPassword: z.string().min(1).max(200) });
export type ConsumeResetInput = z.input<typeof ConsumeReset>;

/** Public: consume a reset token, set the password, revoke all sessions. */
export async function consumePasswordReset(raw: ConsumeResetInput): Promise<{ ok: true }> {
  const v = ConsumeReset.parse(raw);
  if (!isAcceptablePassword(v.newPassword)) throw new ServiceError('validation', 'Password must be at least 12 characters.');
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(v.token) } });
  if (!row || row.usedAt) throw new ServiceError('not_found', 'Reset link is invalid or already used.');
  if (row.expiresAt.getTime() < Date.now()) throw new ServiceError('conflict', 'Reset link has expired.');
  const passwordHash = await hashPassword(v.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash, status: 'ACTIVE' } });
    await tx.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await tx.session.deleteMany({ where: { userId: row.userId } });
  });
  await audit(row.userId, 'account.password.reset', 'user', row.userId);
  return { ok: true };
}
