import { requirePermissionPage } from '@/lib/auth/currentUser';
import { listInfoPages } from '@/lib/cms/infoPageService';
import { LEGAL_PAGES } from '@/config/legalPages';
import { AdminInfoPagesPage } from '@/views/admin/AdminInfoPagesPage';

export default async function Page() {
  await requirePermissionPage('system.config');
  const pages = await listInfoPages();

  const legacySlugs = new Set(LEGAL_PAGES.map((lp) => lp.slug));

  const legacyRows = LEGAL_PAGES.map((lp) => {
    const db = pages.find((p) => p.slug === lp.slug);
    return {
      slug: lp.slug,
      isLegacy: true as const,
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

  const cmsRows = pages
    .filter((p) => !legacySlugs.has(p.slug))
    .map((p) => ({
      slug: p.slug,
      isLegacy: false as const,
      defaultTitle: null as string | null,
      defaultDescription: null as string | null,
      hardcodedReview: null as string | null,
      dbId: p.id,
      dbTitle: p.title,
      dbBody: p.body,
      dbSeoTitle: p.seoTitle,
      dbMetaDescription: p.metaDescription,
      dbStatus: p.status,
      dbUpdatedAt: p.updatedAt?.toISOString() ?? null,
    }));

  return <AdminInfoPagesPage pages={[...legacyRows, ...cmsRows]} />;
}
