'use server';

import { revalidatePath } from 'next/cache';
import { getActor, AuthzError, toActionError, type ActionResult } from '@/lib/cms/guard';
import * as team from '@/lib/cms/teamService';

/**
 * Team & Permissions admin Server Actions (Batch 09). Default-deny RBAC enforced in
 * the service; audited. Every export is an async function (Server Action requirement).
 */
function rev() {
  revalidatePath('/admin/team/');
}
async function actor() {
  const a = await getActor();
  if (!a) throw new AuthzError('unauthenticated');
  return a;
}
async function run<T>(fn: (a: Awaited<ReturnType<typeof actor>>) => Promise<T>): Promise<ActionResult<{ data: T }>> {
  try {
    const data = await fn(await actor());
    rev();
    return { ok: true, data };
  } catch (e) {
    return toActionError(e) as ActionResult<{ data: T }>;
  }
}

export async function createInvitationAction(input: team.InviteInput) {
  return run((a) => team.createInvitation(a, input));
}
export async function revokeInvitationAction(id: string) {
  return run((a) => team.revokeInvitation(a, id));
}
export async function setStaffStatusAction(userId: string, status: 'ACTIVE' | 'SUSPENDED') {
  return run((a) => team.setStaffStatus(a, userId, status));
}
export async function assignRolesAction(userId: string, roleKeys: team.RolesInput['roleKeys']) {
  return run((a) => team.assignRoles(a, userId, { roleKeys }));
}
export async function revokeStaffSessionsAction(userId: string) {
  return run((a) => team.revokeStaffSessions(a, userId));
}
export async function createPasswordResetAction(userId: string) {
  return run((a) => team.createPasswordReset(a, userId));
}
