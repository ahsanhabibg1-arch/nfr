import { requirePermissionPage } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { buildPermissionMatrix } from '@/lib/auth/permissions';
import * as team from '@/lib/cms/teamService';
import { AdminTeamPage } from '@/views/admin/AdminTeamPage';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermissionPage('user.manage');
  const actor = { id: user.id, roles: user.roles };
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const filters = { q: str(sp.q), role: str(sp.role), status: str(sp.status) };

  const [staff, invitations] = await Promise.all([team.listStaff(actor, filters), team.listInvitations(actor)]);
  const matrix = buildPermissionMatrix();

  return (
    <AdminTeamPage
      staff={staff}
      invitations={invitations}
      matrix={matrix}
      filters={filters}
      currentUserId={user.id}
      caps={{
        canAssign: roleHasPermission(user.roles, 'role.assign'),
        isSuperAdmin: user.roles.includes('super_admin'),
      }}
    />
  );
}
