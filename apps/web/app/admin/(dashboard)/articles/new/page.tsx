import { requirePermissionPage } from '@/lib/auth/currentUser';
import { buildEditorPermissions } from '@/lib/auth/rbac';
import { listAuthors, listCategories } from '@/lib/cms/taxonomyService';
import { listArticleRelationshipOptions, listSourceDirectoryOptions } from '@/lib/cms/adminQueries';
import { AdminArticleEditorShell } from '@/views/admin/AdminArticleEditorShell';
import { getArticleTypeSnapshot } from '@/lib/cms/articleTypeRegistry';

export default async function Page() {
  const user = await requirePermissionPage('article.create');
  // Batch 04-E: the managed Article Type definitions are resolved here, on the
  // server, and handed to the client shell — no browser request for the list.
  const [authors, relationshipOptions, sourceDirectory, articleTypes, categories] = await Promise.all([
    listAuthors(), listArticleRelationshipOptions(), listSourceDirectoryOptions(), getArticleTypeSnapshot(),
    // Stage 02 (H-01): the Primary Section list comes from the managed
    // categories, so an administrator-created one needs no code change.
    listCategories(),
  ]);
  return (
    <AdminArticleEditorShell
      permissions={buildEditorPermissions(user.roles)}
      actorName={user.name}
      authors={authors.map((a) => ({ id: a.id, name: a.name, role: a.role }))}
      relationshipOptions={relationshipOptions}
      sourceDirectory={sourceDirectory}
      articleTypes={articleTypes}
      categories={categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
    />
  );
}
