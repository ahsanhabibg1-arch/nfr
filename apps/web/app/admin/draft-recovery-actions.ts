'use server';

import { getCurrentUser } from '@/lib/auth/currentUser';
import * as svc from '@/lib/cms/draftRecoveryService';
import { ServiceError, type ActorContext } from '@/lib/cms/articleService';

/**
 * Server Actions for composer recovery.
 *
 * Deliberately NARROW: a snapshot is the caller's own editor state, so every
 * action here resolves the actor from the session and the service scopes its
 * queries to that id. Nothing takes a user id from the client, which is what
 * keeps one editor's unfinished work out of another's hands.
 *
 * None of these touch the Article table, the public site or the sitemap, so
 * none of them revalidate a public path — recovery is not publication.
 */

export type RecoveryResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; code: string; error: string };

async function getActor(): Promise<ActorContext | null> {
  const u = await getCurrentUser();
  return u ? { id: u.id, roles: u.roles } : null;
}

function fail(e: unknown): RecoveryResult {
  if (e instanceof ServiceError) return { ok: false, code: e.code, error: e.message };
  console.error('[draft-recovery] unexpected error:', e);
  return { ok: false, code: 'error', error: 'Could not reach the recovery store.' };
}

/** Writes the autosave snapshot for one composer session. */
export async function saveDraftSnapshotAction(
  input: svc.SaveSnapshotInput,
): Promise<RecoveryResult<{ id: string; savedAt: string }>> {
  const actor = await getActor();
  if (!actor) return { ok: false, code: 'unauthenticated', error: 'You must be signed in.' };
  try {
    const r = await svc.saveDraftSnapshot(actor, input);
    return { ok: true, id: r.id, savedAt: r.updatedAt.toISOString() };
  } catch (e) {
    return fail(e) as RecoveryResult<{ id: string; savedAt: string }>;
  }
}

/** Reads one snapshot back into the composer. */
export async function loadDraftSnapshotAction(
  id: string,
): Promise<RecoveryResult<{ snapshot: svc.DraftSnapshotRecord }>> {
  const actor = await getActor();
  if (!actor) return { ok: false, code: 'unauthenticated', error: 'You must be signed in.' };
  try {
    return { ok: true, snapshot: await svc.getDraftSnapshot(actor, id) };
  } catch (e) {
    return fail(e) as RecoveryResult<{ snapshot: svc.DraftSnapshotRecord }>;
  }
}

/** Throws a recovery draft away, by id (from the list) or by composer key. */
export async function discardDraftSnapshotAction(
  ref: { id: string } | { composerKey: string },
): Promise<RecoveryResult> {
  const actor = await getActor();
  if (!actor) return { ok: false, code: 'unauthenticated', error: 'You must be signed in.' };
  try {
    if ('id' in ref) await svc.discardDraftSnapshot(actor, ref.id);
    else await svc.discardComposerSnapshot(actor, ref.composerKey);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
