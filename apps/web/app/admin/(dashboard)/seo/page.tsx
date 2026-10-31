import { requireUser } from '@/lib/auth/currentUser';
import { roleHasPermission } from '@/lib/auth/rbac';
import { getSeoDashboard, listFindings, listSeoRules, getSeoThresholds } from '@/lib/cms/seoService';
import { AdminSEOPage } from '@/views/admin/AdminSEOPage';

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const actor = { id: user.id, roles: user.roles };
  const sp = await searchParams;
  const filters = { status: str(sp.status), severity: str(sp.severity), category: str(sp.category), q: str(sp.q), page: Number(str(sp.page)) || 1 };
  const canConfig = roleHasPermission(user.roles, 'seo.config');
  const [dashboard, findings, rules, thresholds] = await Promise.all([
    getSeoDashboard(actor),
    listFindings(actor, filters),
    listSeoRules(actor),
    getSeoThresholds(actor),
  ]);
  return (
    <AdminSEOPage
      dashboard={dashboard}
      findings={findings}
      filters={filters}
      rules={rules}
      thresholds={thresholds}
      canRun={roleHasPermission(user.roles, 'seo.audit.run')}
      canManage={roleHasPermission(user.roles, 'seo.finding.manage')}
      canConfig={canConfig}
    />
  );
}
