import { redirect } from 'next/navigation';
import type { LandingEntityType } from '@prisma/client';
import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { listLandingEntities, getLandingDetail } from '@/lib/cms/landingAdminService';
import { AdminLandingSeoPage } from '@/views/admin/AdminLandingSeoPage';

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const TYPES: LandingEntityType[] = ['RODEO_HUB', 'RODEO_EVENT', 'RODEO_EDITION', 'DISCIPLINE', 'CATEGORY'];

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  // Landing manager is available to holders of either owning permission.
  if (!roleHasPermission(user.roles, 'rodeo.manage') && !roleHasPermission(user.roles, 'taxonomy.manage')) {
    redirect('/admin/?denied=1');
  }
  const actor = { id: user.id, roles: user.roles };
  const sp = await searchParams;
  const type = str(sp.type) as LandingEntityType | undefined;
  const id = str(sp.id);

  const groups = await listLandingEntities(actor);
  const selected = type && id && TYPES.includes(type) ? await getLandingDetail(actor, type, id).catch(() => null) : null;

  return <AdminLandingSeoPage groups={groups} selected={selected} />;
}
