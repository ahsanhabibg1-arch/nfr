import 'server-only';
import { getCurrentUser } from '../auth/currentUser';
import { Permission, roleHasPermission, RoleKey } from '../auth/rbac';
import { prisma } from '../db';

/**
 * Shared authorization guard + audit helper for Batch 04 module Server Actions.
 * Default-deny: a missing session is `unauthenticated`; a missing permission is
 * `forbidden`. Enforcement is always server-side.
 */
export interface Actor {
  id: string;
  roles: RoleKey[];
}

export class AuthzError extends Error {
  code: 'unauthenticated' | 'forbidden';
  constructor(code: 'unauthenticated' | 'forbidden') {
    super(code);
    this.code = code;
  }
}

export type ActionResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; code: string; error: string; details?: unknown };

export async function getActor(): Promise<Actor | null> {
  const u = await getCurrentUser();
  return u ? { id: u.id, roles: u.roles } : null;
}

export async function requireActor(perm: Permission): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new AuthzError('unauthenticated');
  if (!roleHasPermission(actor.roles, perm)) throw new AuthzError('forbidden');
  return actor;
}

export async function audit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId?: string,
  detail?: string,
): Promise<void> {
  await prisma.auditLog.create({ data: { actorId, action, entityType, entityId: entityId ?? null, detail: detail ?? null } });
}

/** Normalize a thrown error (AuthzError / service error with `.code`) to an ActionResult. */
export function toActionError(e: unknown): ActionResult {
  if (e instanceof AuthzError) {
    return { ok: false, code: e.code, error: e.code === 'unauthenticated' ? 'You must be signed in.' : 'You do not have permission to do that.' };
  }
  const code = (e as { code?: string })?.code;
  if (code) return { ok: false, code, error: (e as Error).message, details: (e as { details?: unknown }).details };
  console.error('[admin-action] unexpected error:', e);
  return { ok: false, code: 'error', error: 'Unexpected server error.' };
}
