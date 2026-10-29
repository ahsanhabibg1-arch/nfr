import { requirePermissionPage } from '@/lib/auth/currentUser';
import { buildEditorPermissions } from '@/lib/auth/rbac';
import { AdminArticleEditorShell } from '@/views/admin/AdminArticleEditorShell';

export default async function Page() {
  const user = await requirePermissionPage('article.create');
  return (
    <AdminArticleEditorShell
      permissions={buildEditorPermissions(user.roles)}
      actorName={user.name}
    />
  );
}
