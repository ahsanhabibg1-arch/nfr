import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getSessionToken, validateSessionToken } from './session';
import { RoleKey, Permission, roleHasPermission } from './rbac';

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  roles: RoleKey[];
}

/**
 * Resolve the authenticated user from the session cookie (request-cached).
 * Returns null when unauthenticated. Server-only — the single server-side
 * identity source (Batch 03 §3).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await getSessionToken();
  if (!token) return null;
  const session = await validateSessionToken(token);
  if (!session) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    roles: session.user.roles.map((r) => r.role.key as RoleKey),
  };
});

/** Page-level guard: redirect to the login page when unauthenticated. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/admin/login/');
  return user;
}

/** Page-level guard: require a permission, else bounce to the overview. */
export async function requirePermissionPage(perm: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roleHasPermission(user.roles, perm)) redirect('/admin/?denied=1');
  return user;
}

/**
 * Entry gate for the WHOLE Admin CMS shell. Requires an authenticated STAFF user
 * (one holding `cms.access`). A logged-in NON-staff user — e.g. a public `reader`
 * (Batch 24) or a user with no/revoked roles — is sent to the public site; they must
 * never see the admin shell or any admin page. Unauthenticated users go to login.
 *
 * This is deliberately NOT `requirePermissionPage('cms.access')`: that bounces to
 * `/admin/?denied=1`, which is itself inside the gated shell and would loop.
 */
export async function requireCmsAccess(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roleHasPermission(user.roles, 'cms.access')) redirect('/');
  return user;
}

export function userHasPermission(user: CurrentUser | null, perm: Permission): boolean {
  return !!user && roleHasPermission(user.roles, perm);
}
