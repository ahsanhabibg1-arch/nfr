import { requirePermissionPage } from '@/lib/auth/currentUser';
import * as settings from '@/lib/cms/settingsService';
import { AdminSettingsPage } from '@/views/admin/AdminSettingsPage';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermissionPage('system.config');
  const actor = { id: user.id, roles: user.roles };
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const auditFilters = { action: str(sp.action), actorId: str(sp.actorId), page: Number(str(sp.page)) || 1 };

  const [sys, operational, audit] = await Promise.all([
    settings.getSystemSettings(actor),
    settings.getOperationalStatus(actor),
    settings.listAuditLog(actor, auditFilters),
  ]);

  return <AdminSettingsPage settings={sys} operational={operational} audit={audit} auditFilters={auditFilters} />;
}
