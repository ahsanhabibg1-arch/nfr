import { requirePermissionPage } from '@/lib/auth/currentUser';
import { listInfoPages } from '@/lib/cms/infoPageService';
import { prisma } from '@/lib/db';
import { LEGAL_PAGES } from '@/config/legalPages';
import { AdminInfoPagesPage } from '@/views/admin/AdminInfoPagesPage';

export default async function Page() {
  await requirePermissionPage('system.config');
  const pages = await listInfoPages();
  // One batched lookup for the hero thumbnails rather than one per row.
  const heroIds = [...new Set(pages.map((p) => p.heroMediaId).filter((v): v is string => !!v))];
  const heroAssets = heroIds.length
    ? await prisma.mediaAsset.findMany({ where: { id: { in: heroIds } }, select: { id: true, url: true } })
    : [];
  const heroUrlById = new Map(heroAssets.map((a) => [a.id, a.url]));

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
      /*
        The live state is separate from the draft's status now, so the manager
        reports both. `isLive` is what a visitor can actually reach;
        `hasUnpublishedChanges` is the case the old screen could not show at
        all — a page that is live while a newer draft waits behind it.
      */
      isLive: db ? db.archivedAt === null && db.publishedSnapshot !== null : false,
      hasUnpublishedChanges: db ? db.publishedSnapshot !== null && db.status !== 'PUBLISHED' : false,
      isProtected: db?.isProtected ?? true,
      isArchived: db?.archivedAt != null,
      pageType: db?.pageType ?? 'SYSTEM',
      version: db?.version ?? 0,
      heroMediaId: db?.heroMediaId ?? null,
      heroUrl: db?.heroMediaId ? heroUrlById.get(db.heroMediaId) ?? null : null,
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
      isLive: p.archivedAt === null && p.publishedSnapshot !== null,
      hasUnpublishedChanges: p.publishedSnapshot !== null && p.status !== 'PUBLISHED',
      isProtected: p.isProtected,
      isArchived: p.archivedAt != null,
      pageType: p.pageType,
      version: p.version,
      heroMediaId: p.heroMediaId,
      heroUrl: p.heroMediaId ? heroUrlById.get(p.heroMediaId) ?? null : null,
    }));

  return <AdminInfoPagesPage pages={[...legacyRows, ...cmsRows]} />;
}
