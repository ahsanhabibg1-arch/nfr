import { requirePermissionPage } from '@/lib/auth/currentUser';
import { listInfoPages } from '@/lib/cms/infoPageService';
import { LEGAL_PAGES } from '@/config/legalPages';
import { AdminInfoPagesPage } from '@/views/admin/AdminInfoPagesPage';

export default async function Page() {
  await requirePermissionPage('system.config');
  const pages = await listInfoPages();

  const rows = LEGAL_PAGES.map((lp) => {
    const db = pages.find((p) => p.slug === lp.slug);
    return {
      slug: lp.slug,
      defaultTitle: lp.title,
      defaultDescription: lp.description,
      hardcodedReview: lp.review,
      dbId: db?.id ?? null,
      dbTitle: db?.title ?? null,
      dbBody: db?.body ?? null,
      dbSeoTitle: db?.seoTitle ?? null,
      dbMetaDescription: db?.metaDescription ?? null,
      dbStatus: db?.status ?? null,
      dbUpdatedAt: db?.updatedAt?.toISOString() ?? null,
    };
  });

  return <AdminInfoPagesPage pages={rows} />;
}
