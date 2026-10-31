import { requirePermissionPage } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import * as analytics from '@/lib/cms/analyticsService';
import { AdminAnalyticsPage } from '@/views/admin/AdminAnalyticsPage';

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermissionPage('analytics.view');
  const actor = { id: user.id, roles: user.roles };
  const sp = await searchParams;
  const days = Math.min(400, Math.max(1, Number(str(sp.range)) || 30));

  const caps = {
    canSearch: roleHasPermission(user.roles, 'search.analytics.view'),
    canConfig: roleHasPermission(user.roles, 'analytics.config'),
    canProvider: roleHasPermission(user.roles, 'analytics.provider.manage'),
    canExport: roleHasPermission(user.roles, 'analytics.export'),
  };

  const [overview, performance, providers, config] = await Promise.all([
    analytics.getAnalyticsOverview(actor, days),
    analytics.getContentPerformance(actor, days),
    analytics.getProviderStatuses(actor),
    analytics.getAnalyticsConfig(actor),
  ]);

  const [search, gaps, seoLink] = caps.canSearch
    ? await Promise.all([
        analytics.getSearchAnalytics(actor, days),
        analytics.getContentGaps(actor, Math.max(days, 90)),
        analytics.getSearchInformedSeo(actor, Math.max(days, 90)),
      ])
    : [null, null, null];

  return (
    <AdminAnalyticsPage
      days={days}
      overview={overview}
      performance={performance}
      search={search}
      gaps={gaps}
      seoLink={seoLink}
      providers={providers}
      config={config}
      caps={caps}
    />
  );
}
