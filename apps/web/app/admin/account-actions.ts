'use server';

import { getActor, AuthzError, toActionError, type ActionResult } from '@/lib/cms/guard';
import { getSessionToken } from '@/lib/auth/session';
import * as team from '@/lib/cms/teamService';

/**
 * Own-account Server Actions (Batch 09): password change + session management for the
 * signed-in user. The current session token is read server-side so password change /
 * "revoke other sessions" can keep the acting session alive.
 */
async function actor() {
  const a = await getActor();
  if (!a) throw new AuthzError('unauthenticated');
  return a;
}

export async function changePasswordAction(input: team.PwChangeInput): Promise<ActionResult> {
  try {
    const a = await actor();
    const token = await getSessionToken();
    await team.changeOwnPassword(a, input, token);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function revokeOwnOtherSessionsAction(): Promise<ActionResult<{ revoked: number }>> {
  try {
    const a = await actor();
    const token = await getSessionToken();
    const r = await team.revokeOwnOtherSessions(a, token);
    return { ok: true, ...r };
  } catch (e) {
    return toActionError(e) as ActionResult<{ revoked: number }>;
  }
}
