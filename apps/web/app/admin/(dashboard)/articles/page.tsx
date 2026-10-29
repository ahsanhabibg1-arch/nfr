import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { getAdminArticleList } from '@/lib/cms/adminQueries';
import { getPublishedCategories } from '@/lib/content';
import { AdminArticlesPage } from '@/views/admin/AdminArticlesPage';

type SP = { searchParams: Promise<Record<string, string | undefined>> };

export default async function Page({ searchParams }: SP) {
  const user = await requireUser();
  const sp = await searchParams;
  const result = await getAdminArticleList({
    q: sp.q,
    status: sp.status,
    categorySlug: sp.category,
    sort: (sp.sort as 'updated' | 'created' | 'published') || 'updated',
    dir: (sp.dir as 'asc' | 'desc') || 'desc',
    page: sp.page ? parseInt(sp.page, 10) || 1 : 1,
  });
  const categories = await getPublishedCategories();

  return (
    <AdminArticlesPage
      result={result}
      filters={{ q: sp.q ?? '', status: sp.status ?? '', category: sp.category ?? '', sort: sp.sort ?? 'updated' }}
      categories={categories}
      canPublish={roleHasPermission(user.roles, 'article.publish')}
      canDelete={roleHasPermission(user.roles, 'article.delete')}
    />
  );
}
