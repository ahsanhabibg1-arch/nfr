'use server';

import { toActionError, type ActionResult } from '@/lib/cms/guard';
import * as team from '@/lib/cms/teamService';

/**
 * PUBLIC (no session) Server Actions for accepting a manually-shared invitation link
 * and consuming an administrator-created password reset link (Batch 09 §6/§12). No
 * email is sent by the app; these complete the account-setup flow once the user opens
 * the link. Tokens are single-use + time-limited and never logged.
 */
export async function acceptInvitationAction(input: team.AcceptInput): Promise<ActionResult<{ email: string }>> {
  try {
    const r = await team.acceptInvitation(input);
    return { ok: true, email: r.email };
  } catch (e) {
    return toActionError(e) as ActionResult<{ email: string }>;
  }
}

export async function consumePasswordResetAction(input: team.ConsumeResetInput): Promise<ActionResult> {
  try {
    await team.consumePasswordReset(input);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
