import { requirePermissionPage } from '@/lib/auth/currentUser';
import * as settings from '@/lib/cms/settingsService';
import { getAllSectionConfigs } from '@/lib/cms/sectionConfigService';
import { PRIMARY_SECTIONS } from '@/config/routes';
import { AdminSettingsPage } from '@/views/admin/AdminSettingsPage';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePermissionPage('system.config');
  const actor = { id: user.id, roles: user.roles };
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const auditFilters = { action: str(sp.action), actorId: str(sp.actorId), page: Number(str(sp.page)) || 1 };

  const [sys, operational, audit, sectionConfigs] = await Promise.all([
    settings.getSystemSettings(actor),
    settings.getOperationalStatus(actor),
    settings.listAuditLog(actor, auditFilters),
    getAllSectionConfigs(),
  ]);

  const sections = Object.values(PRIMARY_SECTIONS).map((s) => {
    const cfg = sectionConfigs.find((c) => c.sectionKey === s.id);
    return {
      sectionKey: s.id,
      defaultName: s.name,
      defaultTagline: s.tagline,
      defaultDescription: s.description,
      displayName: cfg?.displayName ?? '',
      tagline: cfg?.tagline ?? '',
      description: cfg?.description ?? '',
      heroImage: cfg?.heroImage ?? '',
      visible: cfg?.visible ?? true,
    };
  });

  return <AdminSettingsPage settings={sys} operational={operational} audit={audit} auditFilters={auditFilters} sections={sections} />;
}
