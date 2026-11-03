import { requirePermissionPage } from '@/lib/auth/currentUser';
import { buildEditorPermissions } from '@/lib/auth/rbac';
import { listAuthors } from '@/lib/cms/taxonomyService';
import { listArticleRelationshipOptions, listSourceDirectoryOptions } from '@/lib/cms/adminQueries';
import { AdminArticleEditorShell } from '@/views/admin/AdminArticleEditorShell';

export default async function Page() {
  const user = await requirePermissionPage('article.create');
  const [authors, relationshipOptions, sourceDirectory] = await Promise.all([listAuthors(), listArticleRelationshipOptions(), listSourceDirectoryOptions()]);
  return (
    <AdminArticleEditorShell
      permissions={buildEditorPermissions(user.roles)}
      actorName={user.name}
      authors={authors.map((a) => ({ id: a.id, name: a.name, role: a.role }))}
      relationshipOptions={relationshipOptions}
      sourceDirectory={sourceDirectory}
    />
  );
}
