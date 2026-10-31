import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/currentUser';
import { buildEditorPermissions } from '@/lib/auth/rbac';
import { getEditableArticle } from '@/lib/cms/adminQueries';
import { AdminArticleEditorShell } from '@/views/admin/AdminArticleEditorShell';
import { ArticleSeoPanel } from '@/views/admin/ArticleSeoPanel';

type Params = { params: Promise<{ id: string }> };

export default async function Page({ params }: Params) {
  const user = await requireUser();
  const { id } = await params;
  const payload = await getEditableArticle(id);
  if (!payload) notFound();

  return (
    <>
      <AdminArticleEditorShell
        initialArticle={payload.article}
        initialVersion={payload.version}
        initialRevisions={payload.revisions}
        permissions={buildEditorPermissions(user.roles)}
        actorName={user.name}
      />
      {/* Advisory SEO diagnostics — does not alter the eight-field editor (§19). */}
      <ArticleSeoPanel articleId={id} userId={user.id} roles={user.roles} />
    </>
  );
}
