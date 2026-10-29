import type { PrismaClient } from '@prisma/client';
import { ROLE_PERMISSIONS, ROLE_LABELS, RoleKey, Permission } from './rbac';

/**
 * Mirror the code-defined RBAC matrix (rbac.ts) into the Role / Permission /
 * RolePermission tables so the Team module and any future DB-driven checks stay
 * in sync. Enforcement remains code-defined (default-deny); these rows are the
 * reflected view. Idempotent. Takes an explicit client so scripts and tests can
 * pass their own. (No `server-only` — used by CLI scripts and tests.)
 */
export async function syncRolesAndPermissions(db: PrismaClient): Promise<void> {
  const allPerms = new Set<Permission>();
  for (const perms of Object.values(ROLE_PERMISSIONS)) perms.forEach((p) => allPerms.add(p));

  // Find-or-create (tolerate a lost create race → re-read) so the sync is safe
  // to run concurrently (e.g. multiple instances at boot, or parallel tests).
  const permId: Record<string, string> = {};
  for (const key of allPerms) {
    let p = await db.permission.findUnique({ where: { key } });
    if (!p) p = await db.permission.create({ data: { key, label: key } }).catch(() => db.permission.findUniqueOrThrow({ where: { key } }));
    permId[key] = p.id;
  }

  for (const roleKey of Object.keys(ROLE_PERMISSIONS) as RoleKey[]) {
    let role = await db.role.findUnique({ where: { key: roleKey } });
    if (!role) role = await db.role.create({ data: { key: roleKey, name: ROLE_LABELS[roleKey] } }).catch(() => db.role.findUniqueOrThrow({ where: { key: roleKey } }));
    else if (role.name !== ROLE_LABELS[roleKey]) role = await db.role.update({ where: { id: role.id }, data: { name: ROLE_LABELS[roleKey] } });

    const wanted = ROLE_PERMISSIONS[roleKey].map((p) => permId[p]);
    // Insert-ignore the desired links, then prune only links no longer wanted.
    // Never deletes a wanted row, so it is safe under concurrent execution.
    await db.rolePermission.createMany({ data: wanted.map((permissionId) => ({ roleId: role!.id, permissionId })), skipDuplicates: true });
    await db.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: { notIn: wanted } } });
  }
}
