import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/currentUser';
import { buildEditorPermissions } from '@/lib/auth/rbac';
import { getEditableArticle, listArticleRelationshipOptions, listSourceDirectoryOptions } from '@/lib/cms/adminQueries';
import { listAuthors, listCategories } from '@/lib/cms/taxonomyService';
import { AdminArticleEditorShell } from '@/views/admin/AdminArticleEditorShell';
import { ArticleSeoPanel } from '@/views/admin/ArticleSeoPanel';
import { getArticleTypeSnapshot } from '@/lib/cms/articleTypeRegistry';

type Params = { params: Promise<{ id: string }> };

export default async function Page({ params }: Params) {
  const user = await requireUser();
  const { id } = await params;
  const [payload, authors, relationshipOptions, sourceDirectory, articleTypes, categories] = await Promise.all([
    getEditableArticle(id), listAuthors(), listArticleRelationshipOptions(), listSourceDirectoryOptions(),
    // Batch 04-E — resolved server-side so the client shell needs no DB access.
    getArticleTypeSnapshot(),
    // Stage 02 (H-01) — managed categories for the Primary Section selector.
    listCategories(),
  ]);
  if (!payload) notFound();

  return (
    <>
      {/* Keyed by version: after a server-side change (restore / workflow transition +
          router.refresh) the editor remounts with the persisted state instead of stale form state. */}
      <AdminArticleEditorShell
        key={payload.version}
        initialArticle={payload.article}
        initialVersion={payload.version}
        initialRevisions={payload.revisions}
        permissions={buildEditorPermissions(user.roles)}
        actorName={user.name}
        authors={authors.map((a) => ({ id: a.id, name: a.name, role: a.role }))}
        relationshipOptions={relationshipOptions}
        sourceDirectory={sourceDirectory}
        articleTypes={articleTypes}
        categories={categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
      />
      {/* Advisory SEO diagnostics — does not alter the eight-field editor (§19). */}
      <ArticleSeoPanel articleId={id} userId={user.id} roles={user.roles} />
    </>
  );
}
