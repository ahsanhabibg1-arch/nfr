import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { listCategories, listTags, listAuthors } from '@/lib/cms/taxonomyService';
import { AdminEditorialOrgPage } from '@/views/admin/AdminEditorialOrgPage';

export default async function Page() {
  const user = await requireUser();
  const [categories, tags, authors] = await Promise.all([listCategories(), listTags(), listAuthors()]);
  return (
    <AdminEditorialOrgPage
      categories={categories}
      tags={tags}
      authors={authors}
      canTaxonomy={roleHasPermission(user.roles, 'taxonomy.manage')}
      canAuthors={roleHasPermission(user.roles, 'author.manage')}
    />
  );
}
