import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { listNavItems } from '@/lib/cms/navigationService';
import { AdminWebsiteNavPage } from '@/views/admin/AdminWebsiteNavPage';

export default async function Page() {
  const user = await requireUser();
  const items = await listNavItems();
  return <AdminWebsiteNavPage items={items} canManage={roleHasPermission(user.roles, 'navigation.manage')} />;
}
