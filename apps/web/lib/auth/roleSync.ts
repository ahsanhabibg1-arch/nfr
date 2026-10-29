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

  const permId: Record<string, string> = {};
  for (const key of allPerms) {
    const p = await db.permission.upsert({ where: { key }, update: { label: key }, create: { key, label: key } });
    permId[key] = p.id;
  }

  for (const roleKey of Object.keys(ROLE_PERMISSIONS) as RoleKey[]) {
    const role = await db.role.upsert({
      where: { key: roleKey },
      update: { name: ROLE_LABELS[roleKey] },
      create: { key: roleKey, name: ROLE_LABELS[roleKey] },
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const perm of ROLE_PERMISSIONS[roleKey]) {
      await db.rolePermission.create({ data: { roleId: role.id, permissionId: permId[perm] } });
    }
  }
}
