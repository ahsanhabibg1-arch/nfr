import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { getAdminArticleList } from '@/lib/cms/adminQueries';
import { getPublishedCategories } from '@/lib/content';
import { listDraftSnapshots, countDraftSnapshots } from '@/lib/cms/draftRecoveryService';
import { AdminArticlesPage } from '@/views/admin/AdminArticlesPage';

type SP = { searchParams: Promise<Record<string, string | undefined>> };

/**
 * The recovery tab is a different QUESTION, not a different filter.
 *
 * Every other tab narrows the same article list by workflow status. "Unsaved"
 * asks about composer sessions that never became articles, which is a separate
 * table and a separate query — so the status value is intercepted here rather
 * than passed to `getAdminArticleList`, which would otherwise look for a
 * workflow status called "unsaved" and quietly return nothing.
 */
const RECOVERY_TAB = 'unsaved';

export default async function Page({ searchParams }: SP) {
  const user = await requireUser();
  const sp = await searchParams;
  const actor = { id: user.id, roles: user.roles };
  const showingRecovery = sp.status === RECOVERY_TAB;

  const result = await getAdminArticleList({
    q: sp.q,
    status: showingRecovery ? undefined : sp.status,
    categorySlug: sp.category,
    sort: (sp.sort as 'updated' | 'created' | 'published') || 'updated',
    dir: (sp.dir as 'asc' | 'desc') || 'desc',
    page: sp.page ? parseInt(sp.page, 10) || 1 : 1,
  });
  const categories = await getPublishedCategories();

  /*
    The list is loaded only when its tab is open; the COUNT is always loaded,
    because the badge is what tells an author that unsaved work is waiting
    before they think to look for it. Both are scoped to this user by the
    service — a recovery draft is personal, unfinished work.
  */
  const recoveryDrafts = showingRecovery ? await listDraftSnapshots(actor) : [];
  const recoveryCount = showingRecovery ? recoveryDrafts.length : await countDraftSnapshots(actor);

  return (
    <AdminArticlesPage
      result={result}
      filters={{ q: sp.q ?? '', status: sp.status ?? '', category: sp.category ?? '', sort: sp.sort ?? 'updated' }}
      categories={categories}
      canPublish={roleHasPermission(user.roles, 'article.publish')}
      canDelete={roleHasPermission(user.roles, 'article.delete')}
      recoveryDrafts={recoveryDrafts.map((d) => ({
        id: d.id,
        composerKey: d.composerKey,
        articleId: d.articleId,
        title: d.title,
        slug: d.slug,
        wordCount: d.wordCount,
        updatedAt: d.updatedAt.toISOString(),
      }))}
      recoveryCount={recoveryCount}
    />
  );
}
