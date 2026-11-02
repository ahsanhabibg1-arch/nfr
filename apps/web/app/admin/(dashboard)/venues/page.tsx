import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { listVenuesFull } from '@/lib/cms/rodeoService';
import { AdminVenuesPage } from '@/views/admin/AdminVenuesPage';

export default async function Page() {
  const user = await requireUser();
  if (!roleHasPermission(user.roles, 'cms.access')) redirect('/admin/?denied=1');
  const venues = await listVenuesFull();
  return <AdminVenuesPage venues={venues} canManage={roleHasPermission(user.roles, 'rodeo.manage')} />;
}
