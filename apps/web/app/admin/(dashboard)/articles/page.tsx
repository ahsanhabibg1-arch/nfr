import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { getAdminArticleList } from '@/lib/cms/adminQueries';
import { AdminArticlesPage } from '@/views/admin/AdminArticlesPage';

export default async function Page() {
  const user = await requireUser();
  const rows = await getAdminArticleList();
  return (
    <AdminArticlesPage
      rows={rows}
      canPublish={roleHasPermission(user.roles, 'article.publish')}
      canDelete={roleHasPermission(user.roles, 'article.delete')}
    />
  );
}
