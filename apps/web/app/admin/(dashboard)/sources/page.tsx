import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { listSources } from '@/lib/cms/sourceService';
import { AdminSourcesPage } from '@/views/admin/AdminSourcesPage';

export default async function Page() {
  const user = await requireUser();
  const sources = await listSources();
  return <AdminSourcesPage sources={sources} canManage={roleHasPermission(user.roles, 'source.manage')} />;
}
