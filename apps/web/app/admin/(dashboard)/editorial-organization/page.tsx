import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { listCategories, listTags, listAuthors, listSubcategories } from '@/lib/cms/taxonomyService';
import { listArticleTypes, listArticleTypeAudit } from '@/lib/cms/articleTypeService';
import { getArticleTypeRegistryHealth } from '@/lib/cms/articleTypeRegistry';
import { AdminEditorialOrgPage } from '@/views/admin/AdminEditorialOrgPage';

export default async function Page() {
  const user = await requireUser();
  // Batch 04-B: `lifecycle: 'all'` so the tab can offer a "show archived" toggle
  // without a second round trip. Batch 04-E does the same for Article Types.
  const [categories, tags, authors, subcategories, articleTypes, articleTypeAudit, health] = await Promise.all([
    listCategories(), listTags(), listAuthors(), listSubcategories({ lifecycle: 'all' }),
    listArticleTypes({ lifecycle: 'all' }), listArticleTypeAudit(20), getArticleTypeRegistryHealth(),
  ]);
  return (
    <AdminEditorialOrgPage
      categories={categories}
      tags={tags}
      authors={authors}
      subcategories={subcategories}
      articleTypes={articleTypes}
      articleTypeAudit={articleTypeAudit}
      /**
       * Batch 04-E — `source` tells the tab whether the application is running
       * on managed definitions or still on the compiled-in fallback, so an
       * uninitialised registry reads as "not initialised" instead of "none".
       */
      articleTypeSource={health.source}
      /**
       * Unresolved compatibility definitions for an initialised registry.
       */
      articleTypeMissing={health.missing}
      canTaxonomy={roleHasPermission(user.roles, 'taxonomy.manage')}
      canAuthors={roleHasPermission(user.roles, 'author.manage')}
      /**
       * Three separate capabilities, matching the three server-side gates. These
       * only decide what is RENDERED — every action re-checks on the server, so
       * hiding a control is never the security boundary.
       *
       * Batch 04-E.1: the evergreen flag is `articletype.seo`, which only SEO
       * Manager and Super Admin hold. An Administrator sees the value and keeps
       * full Article Type management, but cannot toggle it.
       */
      canArticleTypes={roleHasPermission(user.roles, 'articletype.manage')}
      canArticleTypeSeo={roleHasPermission(user.roles, 'articletype.seo')}
      canArticleTypeSchema={roleHasPermission(user.roles, 'system.config')}
    />
  );
}
